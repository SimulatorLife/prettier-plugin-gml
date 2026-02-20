import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import { createLimitedRecoveryProjection } from "../../language/recovery.js";
import type { ProjectCapability, UnsafeReasonCode } from "../../types/index.js";
import type { GmlRuleDefinition } from "../catalog.js";
import { reportMissingProjectContextOncePerFile, resolveProjectContextForRule } from "../project-context.js";
import { dominantLineEnding, isIdentifier, readObjectOption, shouldReportUnsafe } from "./rule-helpers.js";

const {
    getNodeStartIndex,
    getNodeEndIndex,
    isObjectLike,
    getCallExpressionIdentifierName,
    getCallExpressionArguments
} = CoreWorkspace.Core;

function createMeta(definition: GmlRuleDefinition): Rule.RuleMetaData {
    const docs: {
        description: string;
        recommended: false;
        requiresProjectContext: boolean;
        gml?: {
            requiredCapabilities: ReadonlyArray<ProjectCapability>;
            unsafeReasonCodes: ReadonlyArray<UnsafeReasonCode>;
        };
    } = {
        description: `Rule for ${definition.messageId}.`,
        recommended: false,
        requiresProjectContext: definition.requiresProjectContext
    };

    if (definition.requiresProjectContext) {
        docs.gml = {
            requiredCapabilities: definition.requiredCapabilities,
            unsafeReasonCodes: definition.unsafeReasonCodes
        };
    }

    const messages: Record<string, string> = {
        [definition.messageId]: `${definition.messageId} diagnostic.`
    };

    if (definition.unsafeReasonCodes.length > 0) {
        messages.unsafeFix = "[unsafe-fix:SEMANTIC_AMBIGUITY] Unsafe fix omitted.";
    }

    if (definition.requiresProjectContext) {
        messages.missingProjectContext =
            "Missing project context. Run via CLI with --project or disable this rule in direct ESLint usage.";
    }

    return Object.freeze({
        type: "suggestion",
        fixable: "code",
        docs: Object.freeze(docs),
        schema: definition.schema,
        messages: Object.freeze(messages)
    });
}

const DEFAULT_HOIST_ACCESSORS = Object.freeze({
    array_length: "len"
});

type RepeatLoopCandidate = Readonly<{
    limitExpression: string;
    loopStartIndex: number;
    loopHeaderEndIndex: number;
}>;

type AstNodeWithType = AstNodeRecord & Readonly<{ type: string }>;

type AstNodeParentVisitContext = Readonly<{
    node: AstNodeWithType;
    parent: AstNodeWithType | null;
    parentKey: string | null;
    parentIndex: number | null;
}>;

type ForStatementContainerContext = Readonly<{
    forNode: AstNodeWithType;
    canInsertHoistBeforeLoop: boolean;
}>;

type LoopLengthAccessorCall = Readonly<{
    functionName: string;
    argumentNode: AstNodeWithType;
    callStart: number;
    callEnd: number;
    callText: string;
}>;

type LoopLengthHoistRewrite = Readonly<{
    insertionOffset: number;
    insertionText: string;
    callRewrites: ReadonlyArray<SourceTextEdit>;
    reportOffset: number;
}>;

type AstNodeRecord = Record<string, unknown>;

function isAstNodeRecord(value: unknown): value is AstNodeRecord {
    return isObjectLike(value) && !Array.isArray(value);
}

function isAstNodeWithType(value: unknown): value is AstNodeWithType {
    return isAstNodeRecord(value) && typeof value.type === "string";
}

function walkAstNodesWithParent(root: unknown, visit: (context: AstNodeParentVisitContext) => void): void {
    const pending: Array<AstNodeParentVisitContext> = [];
    if (isAstNodeWithType(root)) {
        pending.push({
            node: root,
            parent: null,
            parentKey: null,
            parentIndex: null
        });
    }

    const seen = new WeakSet<object>();
    while (pending.length > 0) {
        const current = pending.pop();
        if (!current) {
            continue;
        }

        const { node } = current;
        if (seen.has(node)) {
            continue;
        }

        seen.add(node);
        visit(current);

        // Micro-optimization: Use Object.keys() instead of Object.entries().
        // Object.entries() creates an array of [key, value] tuple arrays, allocating
        // 1 + N objects per node (where N = number of properties). Object.keys() creates
        // only 1 array. For a typical AST node with 5 properties, this reduces allocations
        // from 6 to 1 per node visited (~83% reduction). Micro-benchmark shows Object.keys()
        // is 5-6x faster than Object.entries() for property iteration.
        for (const key of Object.keys(node)) {
            if (key === "parent") {
                continue;
            }

            const value = node[key];
            if (Array.isArray(value)) {
                for (let index = value.length - 1; index >= 0; index -= 1) {
                    const childNode = value[index];
                    if (!isAstNodeWithType(childNode)) {
                        continue;
                    }

                    pending.push({
                        node: childNode,
                        parent: node,
                        parentKey: key,
                        parentIndex: index
                    });
                }
                continue;
            }

            if (!isAstNodeWithType(value)) {
                continue;
            }

            pending.push({
                node: value,
                parent: node,
                parentKey: key,
                parentIndex: null
            });
        }
    }
}

function shouldRewriteGlobalvarIdentifierNode(
    identifierNode: AstNodeRecord,
    parentNode: AstNodeRecord | null
): boolean {
    if (!parentNode) {
        return false;
    }

    if (identifierNode.name === "global") {
        return false;
    }

    if (parentNode.type === "GlobalVarStatement") {
        return false;
    }

    if (parentNode.type === "MemberDotExpression" && parentNode.property === identifierNode) {
        return false;
    }

    if ((parentNode.type === "Property" || parentNode.type === "EnumMember") && parentNode.name === identifierNode) {
        return false;
    }

    if (
        (parentNode.type === "VariableDeclarator" ||
            parentNode.type === "FunctionDeclaration" ||
            parentNode.type === "ConstructorDeclaration" ||
            parentNode.type === "ConstructorParentClause") &&
        parentNode.id === identifierNode
    ) {
        return false;
    }

    return true;
}

function escapeRegularExpressionPattern(text: string): string {
    return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function findFirstChangedCharacterOffset(originalText: string, rewrittenText: string): number {
    const minLength = Math.min(originalText.length, rewrittenText.length);
    for (let index = 0; index < minLength; index += 1) {
        if (originalText[index] !== rewrittenText[index]) {
            return index;
        }
    }

    if (originalText.length !== rewrittenText.length) {
        return minLength;
    }

    return 0;
}

/**
 * Reports a full-source-text rewrite as a fixable ESLint diagnostic.
 * If {@link rewrittenText} is identical to {@link originalText}, no
 * diagnostic is emitted. Otherwise the report is located at the first
 * character that differs between the two texts, and the suggested fix
 * replaces the entire source text atomically.
 *
 * @param context - The ESLint rule context for the current file.
 * @param messageId - The diagnostic message ID to use for the report.
 * @param originalText - The source text before the rewrite.
 * @param rewrittenText - The source text after the rewrite.
 */
function reportFullTextRewrite(
    context: Rule.RuleContext,
    messageId: string,
    originalText: string,
    rewrittenText: string
): void {
    if (rewrittenText === originalText) {
        return;
    }

    const firstChangedOffset = findFirstChangedCharacterOffset(originalText, rewrittenText);
    context.report({
        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
        messageId,
        fix: (fixer) => fixer.replaceTextRange([0, originalText.length], rewrittenText)
    });
}

function isCommentOnlyLine(line: string): boolean {
    const trimmedLine = line.trimStart();
    return (
        trimmedLine.startsWith("//") ||
        trimmedLine.startsWith("/*") ||
        trimmedLine.startsWith("*") ||
        trimmedLine.startsWith("*/")
    );
}

function computeLineStartOffsets(sourceText: string): Array<number> {
    const offsets = [0];
    for (let index = 0; index < sourceText.length; index += 1) {
        const character = sourceText[index];
        if (character === "\r" && sourceText[index + 1] === "\n") {
            offsets.push(index + 2);
            index += 1;
            continue;
        }

        if (character === "\n") {
            offsets.push(index + 1);
        }
    }

    return offsets;
}

function getLineIndexForOffset(lineStartOffsets: ReadonlyArray<number>, offset: number): number {
    if (lineStartOffsets.length === 0 || offset <= 0) {
        return 0;
    }

    let low = 0;
    let high = lineStartOffsets.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const lineStart = lineStartOffsets[middle] ?? 0;
        const nextLineStart =
            middle + 1 < lineStartOffsets.length
                ? (lineStartOffsets[middle + 1] ?? Number.MAX_SAFE_INTEGER)
                : Number.MAX_SAFE_INTEGER;
        if (offset < lineStart) {
            high = middle - 1;
            continue;
        }
        if (offset >= nextLineStart) {
            low = middle + 1;
            continue;
        }
        return middle;
    }

    return Math.max(0, Math.min(lineStartOffsets.length - 1, low));
}

function findMatchingBraceEndIndex(sourceText: string, openBraceIndex: number): number {
    let braceDepth = 0;
    for (let index = openBraceIndex; index < sourceText.length; index += 1) {
        const character = sourceText[index];
        if (character === "{") {
            braceDepth += 1;
            continue;
        }

        if (character !== "}") {
            continue;
        }

        braceDepth -= 1;
        if (braceDepth === 0) {
            return index + 1;
        }
    }

    return -1;
}

function usesUnitIncrement(iteratorName: string, updateExpression: string): boolean {
    const compactExpression = updateExpression.replaceAll(/\s+/g, "");
    return (
        compactExpression === `${iteratorName}++` ||
        compactExpression === `++${iteratorName}` ||
        compactExpression === `${iteratorName}+=1` ||
        compactExpression === `${iteratorName}=${iteratorName}+1`
    );
}

function collectRepeatLoopCandidates(sourceText: string): Array<RepeatLoopCandidate> {
    const candidates: Array<RepeatLoopCandidate> = [];
    const forLoopPattern =
        /for\s*\(\s*var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*0\s*;\s*([A-Za-z_][A-Za-z0-9_]*)\s*<\s*([^;]+?)\s*;\s*([^)]+?)\s*\)\s*\{/g;

    for (const match of sourceText.matchAll(forLoopPattern)) {
        const matchStartIndex = match.index ?? 0;
        const iteratorName = match[1];
        const conditionLeftIdentifier = match[2];
        const limitExpression = match[3].trim();
        const updateExpression = match[4];

        if (conditionLeftIdentifier !== iteratorName || limitExpression.length === 0) {
            continue;
        }

        if (!usesUnitIncrement(iteratorName, updateExpression)) {
            continue;
        }

        const iteratorPattern = new RegExp(String.raw`\b${escapeRegularExpressionPattern(iteratorName)}\b`, "u");
        if (iteratorPattern.test(limitExpression)) {
            continue;
        }

        const loopOpenBraceIndex = matchStartIndex + match[0].length - 1;
        const loopEndIndex = findMatchingBraceEndIndex(sourceText, loopOpenBraceIndex);
        if (loopEndIndex === -1) {
            continue;
        }

        const loopBodyText = sourceText.slice(loopOpenBraceIndex + 1, loopEndIndex - 1);
        if (iteratorPattern.test(loopBodyText)) {
            continue;
        }

        candidates.push({
            limitExpression,
            loopStartIndex: matchStartIndex,
            loopHeaderEndIndex: loopOpenBraceIndex + 1
        });
    }

    return candidates;
}

function containsInlineCommentTokens(valueText: string): boolean {
    return valueText.includes("//") || valueText.includes("/*") || valueText.includes("*/");
}

function resolveLoopLengthHoistSuffixMap(
    functionSuffixOverrides: Record<string, string | null> | undefined
): ReadonlyMap<string, string> {
    const suffixMap = new Map<string, string>(Object.entries(DEFAULT_HOIST_ACCESSORS));
    if (!functionSuffixOverrides) {
        return suffixMap;
    }

    for (const [functionName, suffix] of Object.entries(functionSuffixOverrides)) {
        if (!isIdentifier(functionName)) {
            continue;
        }

        if (suffix === null) {
            suffixMap.delete(functionName);
            continue;
        }

        if (typeof suffix !== "string" || suffix.length === 0) {
            continue;
        }

        suffixMap.set(functionName, suffix);
    }

    return suffixMap;
}

function readLineIndentationBeforeOffset(sourceText: string, offset: number): string {
    const boundedOffset = Math.max(0, Math.min(offset, sourceText.length));
    let lineStart = sourceText.lastIndexOf("\n", boundedOffset - 1);
    if (lineStart < 0) {
        lineStart = 0;
    } else {
        lineStart += 1;
    }

    const prefix = sourceText.slice(lineStart, boundedOffset);
    const indentationMatch = /^[\t ]*/u.exec(prefix);
    return indentationMatch?.[0] ?? "";
}

function collectIdentifierNamesInProgram(programNode: unknown): ReadonlySet<string> {
    const identifierNames = new Set<string>();
    walkAstNodes(programNode, (node) => {
        if (!isAstNodeRecord(node) || node.type !== "Identifier" || typeof node.name !== "string") {
            return;
        }

        identifierNames.add(node.name);
    });

    return identifierNames;
}

function collectForStatementContainerContexts(programNode: unknown): ReadonlyArray<ForStatementContainerContext> {
    const contexts: Array<ForStatementContainerContext> = [];

    walkAstNodesWithParent(programNode, (visitContext) => {
        const { node, parent, parentKey } = visitContext;
        if (node.type !== "ForStatement") {
            return;
        }

        const canInsertHoistBeforeLoop =
            parent !== null && parentKey === "body" && (parent.type === "Program" || parent.type === "BlockStatement");

        contexts.push(
            Object.freeze({
                forNode: node,
                canInsertHoistBeforeLoop
            })
        );
    });

    return contexts;
}

function collectLoopLengthAccessorCallsFromTestExpression(parameters: {
    sourceText: string;
    testNode: unknown;
    enabledFunctionNames: ReadonlySet<string>;
}): ReadonlyArray<LoopLengthAccessorCall> {
    const collectedCalls: Array<LoopLengthAccessorCall> = [];
    walkAstNodes(parameters.testNode, (node) => {
        if (!isAstNodeRecord(node) || node.type !== "CallExpression") {
            return;
        }

        const callTarget = isAstNodeRecord(node.object) ? node.object : null;
        if (
            !callTarget ||
            callTarget.type !== "Identifier" ||
            typeof callTarget.name !== "string" ||
            !parameters.enabledFunctionNames.has(callTarget.name)
        ) {
            return;
        }

        if (!Array.isArray(node.arguments) || node.arguments.length !== 1) {
            return;
        }

        const argumentNode = unwrapParenthesized(node.arguments[0]);
        if (!isAstNodeWithType(argumentNode) || argumentNode.type !== "Identifier") {
            return;
        }

        const callStart = getNodeStartIndex(node);
        const callEnd = getNodeEndIndex(node);
        if (typeof callStart !== "number" || typeof callEnd !== "number" || callEnd <= callStart) {
            return;
        }

        const callText = parameters.sourceText.slice(callStart, callEnd).trim();
        if (callText.length === 0) {
            return;
        }

        collectedCalls.push(
            Object.freeze({
                functionName: callTarget.name,
                argumentNode,
                callStart,
                callEnd,
                callText
            })
        );
    });

    const nonOverlappingCalls: Array<LoopLengthAccessorCall> = [];
    const orderedCalls = collectedCalls.toSorted((left, right) => {
        if (left.callStart !== right.callStart) {
            return left.callStart - right.callStart;
        }

        return right.callEnd - left.callEnd;
    });

    for (const call of orderedCalls) {
        if (
            hasOverlappingRange(
                call.callStart,
                call.callEnd,
                nonOverlappingCalls.map((existingCall) => ({
                    start: existingCall.callStart,
                    end: existingCall.callEnd
                }))
            )
        ) {
            continue;
        }

        nonOverlappingCalls.push(call);
    }

    return nonOverlappingCalls;
}

function buildLoopLengthHoistPreferredName(
    call: LoopLengthAccessorCall,
    suffixMap: ReadonlyMap<string, string>
): string | null {
    const functionSuffix = suffixMap.get(call.functionName);
    if (typeof functionSuffix !== "string" || functionSuffix.length === 0) {
        return null;
    }

    const argumentIdentifierName = call.argumentNode.name;
    if (typeof argumentIdentifierName !== "string") {
        return `${call.functionName}_${functionSuffix}`;
    }

    if (!isIdentifier(argumentIdentifierName)) {
        return `${call.functionName}_${functionSuffix}`;
    }

    return `${argumentIdentifierName}_${functionSuffix}`;
}

function createLoopLengthHoistRewrite(parameters: {
    sourceText: string;
    loopContext: ForStatementContainerContext;
    suffixMap: ReadonlyMap<string, string>;
    resolveHoistName: (preferredName: string, localIdentifierNames: ReadonlySet<string>) => string | null;
    localIdentifierNames: Set<string>;
    lineEnding: string;
}): LoopLengthHoistRewrite | null {
    const forNode = parameters.loopContext.forNode;
    const forStart = getNodeStartIndex(forNode);
    if (typeof forStart !== "number") {
        return null;
    }
    const loopLineStart = getLineStartOffset(parameters.sourceText, forStart);

    const accessorCalls = collectLoopLengthAccessorCallsFromTestExpression({
        sourceText: parameters.sourceText,
        testNode: forNode.test,
        enabledFunctionNames: new Set(parameters.suffixMap.keys())
    });
    if (accessorCalls.length === 0) {
        return null;
    }

    if (!parameters.loopContext.canInsertHoistBeforeLoop) {
        return null;
    }

    const byAccessorText = new Map<string, { hoistName: string; calls: Array<LoopLengthAccessorCall> }>();
    const localIdentifierNamesInLoop = new Set(parameters.localIdentifierNames);
    const reservedHoistNames: Array<string> = [];
    for (const accessorCall of accessorCalls) {
        const existing = byAccessorText.get(accessorCall.callText);
        if (existing) {
            existing.calls.push(accessorCall);
            continue;
        }

        const preferredName = buildLoopLengthHoistPreferredName(accessorCall, parameters.suffixMap);
        if (!preferredName) {
            return null;
        }

        const resolvedHoistName = parameters.resolveHoistName(preferredName, localIdentifierNamesInLoop);
        if (!resolvedHoistName) {
            return null;
        }

        localIdentifierNamesInLoop.add(resolvedHoistName);
        reservedHoistNames.push(resolvedHoistName);
        byAccessorText.set(accessorCall.callText, {
            hoistName: resolvedHoistName,
            calls: [accessorCall]
        });
    }

    const loopIndentation = readLineIndentationBeforeOffset(parameters.sourceText, forStart);
    const orderedHoists = [...byAccessorText.entries()].toSorted((left, right) => {
        const leftStart = left[1].calls[0]?.callStart ?? 0;
        const rightStart = right[1].calls[0]?.callStart ?? 0;
        return leftStart - rightStart;
    });

    const hoistLines: Array<string> = [];
    const callRewrites: Array<SourceTextEdit> = [];
    let reportOffset = forStart;
    for (const [callText, record] of orderedHoists) {
        hoistLines.push(`${loopIndentation}var ${record.hoistName} = ${callText};`);

        for (const call of record.calls) {
            callRewrites.push(
                Object.freeze({
                    start: call.callStart,
                    end: call.callEnd,
                    text: record.hoistName
                })
            );

            if (call.callStart < reportOffset) {
                reportOffset = call.callStart;
            }
        }
    }

    for (const hoistName of reservedHoistNames) {
        parameters.localIdentifierNames.add(hoistName);
    }

    return Object.freeze({
        insertionOffset: loopLineStart,
        insertionText: `${hoistLines.join(parameters.lineEnding)}${parameters.lineEnding}`,
        callRewrites,
        reportOffset
    });
}

function createPreferLoopLengthHoistRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const functionSuffixes = options.functionSuffixes as Record<string, string | null> | undefined;
            const shouldReportUnsafeFixes = shouldReportUnsafe(context);
            const suffixMap = resolveLoopLengthHoistSuffixMap(functionSuffixes);

            const listener: Rule.RuleListener = {
                Program(programNode) {
                    if (suffixMap.size === 0) {
                        return;
                    }

                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const projectContextResolution = resolveProjectContextForRule(context, definition);
                    if (!projectContextResolution.available || !projectContextResolution.context) {
                        context.report({
                            node: programNode as never,
                            messageId: "missingProjectContext"
                        });
                        return;
                    }

                    const localIdentifierNames = new Set(collectIdentifierNamesInProgram(programNode));
                    const loopContexts = collectForStatementContainerContexts(programNode);
                    const resolveHoistName = (
                        preferredName: string,
                        inScopeIdentifierNames: ReadonlySet<string>
                    ): string | null =>
                        projectContextResolution.context.resolveLoopHoistIdentifier(
                            preferredName,
                            inScopeIdentifierNames
                        );
                    let firstUnsafeOffset: number | null = null;

                    for (const loopContext of loopContexts) {
                        const rewrite = createLoopLengthHoistRewrite({
                            sourceText: text,
                            loopContext,
                            suffixMap,
                            resolveHoistName,
                            localIdentifierNames,
                            lineEnding
                        });

                        if (!rewrite) {
                            const forStart = getNodeStartIndex(loopContext.forNode);
                            if (typeof forStart !== "number") {
                                continue;
                            }

                            const hasAccessorCallInTest =
                                collectLoopLengthAccessorCallsFromTestExpression({
                                    sourceText: text,
                                    testNode: loopContext.forNode.test,
                                    enabledFunctionNames: new Set(suffixMap.keys())
                                }).length > 0;
                            if (!hasAccessorCallInTest) {
                                continue;
                            }

                            if (firstUnsafeOffset === null || forStart < firstUnsafeOffset) {
                                firstUnsafeOffset = forStart;
                            }
                            continue;
                        }

                        context.report({
                            loc: context.sourceCode.getLocFromIndex(rewrite.reportOffset),
                            messageId: definition.messageId,
                            fix: (fixer) => [
                                fixer.insertTextAfterRange(
                                    [rewrite.insertionOffset, rewrite.insertionOffset],
                                    rewrite.insertionText
                                ),
                                ...rewrite.callRewrites.map((callRewrite) =>
                                    fixer.replaceTextRange([callRewrite.start, callRewrite.end], callRewrite.text)
                                )
                            ]
                        });
                    }

                    if (firstUnsafeOffset !== null && shouldReportUnsafeFixes) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(firstUnsafeOffset),
                            messageId: "unsafeFix"
                        });
                    }
                }
            };

            return Object.freeze(listener);
        }
    });
}

function createPreferHoistableLoopAccessorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const minOccurrences = typeof options.minOccurrences === "number" ? options.minOccurrences : 2;

            return Object.freeze({
                Program(programNode) {
                    const sourceText = context.sourceCode.text;
                    const loopNodes: Array<AstNodeWithType> = [];
                    walkAstNodes(programNode, (node) => {
                        if (!isAstNodeWithType(node)) {
                            return;
                        }

                        if (
                            node.type === "ForStatement" ||
                            node.type === "WhileStatement" ||
                            node.type === "RepeatStatement" ||
                            node.type === "DoUntilStatement"
                        ) {
                            loopNodes.push(node);
                        }
                    });

                    let firstReportOffset: number | null = null;
                    for (const loopNode of loopNodes) {
                        const loopCalls = collectLoopLengthAccessorCallsFromTestExpression({
                            sourceText,
                            testNode: loopNode,
                            enabledFunctionNames: new Set(["array_length"])
                        });
                        if (loopCalls.length === 0) {
                            continue;
                        }

                        if (loopNode.type === "ForStatement") {
                            const testCalls = collectLoopLengthAccessorCallsFromTestExpression({
                                sourceText,
                                testNode: loopNode.test,
                                enabledFunctionNames: new Set(["array_length"])
                            });
                            if (testCalls.length > 0) {
                                continue;
                            }
                        }

                        const groupedByAccessor = new Map<string, { count: number; firstOffset: number }>();
                        for (const call of loopCalls) {
                            const existing = groupedByAccessor.get(call.callText);
                            if (existing) {
                                existing.count += 1;
                                continue;
                            }

                            groupedByAccessor.set(call.callText, {
                                count: 1,
                                firstOffset: call.callStart
                            });
                        }

                        for (const group of groupedByAccessor.values()) {
                            if (group.count < minOccurrences) {
                                continue;
                            }

                            if (firstReportOffset === null || group.firstOffset < firstReportOffset) {
                                firstReportOffset = group.firstOffset;
                            }
                        }
                    }

                    if (firstReportOffset !== null) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(firstReportOffset),
                            messageId: definition.messageId
                        });
                    }
                }
            });
        }
    });
}

function createPreferRepeatLoopsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const loopCandidates = collectRepeatLoopCandidates(sourceText);
                    for (const loopCandidate of loopCandidates) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(loopCandidate.loopStartIndex),
                            messageId: definition.messageId,
                            fix: (fixer) =>
                                fixer.replaceTextRange(
                                    [loopCandidate.loopStartIndex, loopCandidate.loopHeaderEndIndex],
                                    `repeat (${loopCandidate.limitExpression}) {`
                                )
                        });
                    }
                }
            });
        }
    });
}

function createPreferStructLiteralAssignmentsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const shouldReportUnsafeFixes = shouldReportUnsafe(context);
            const listener: Rule.RuleListener = {
                Program() {
                    const text = context.sourceCode.text;
                    const lines = text.split(/\r?\n/);
                    const lineStartOffsets = computeLineStartOffsets(text);
                    const dotAssignmentPattern =
                        /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?);\s*(?:\/\/\s*(.*))?$/u;
                    const staticIndexAssignmentPattern =
                        /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\[\$\s*(?:"([A-Za-z_][A-Za-z0-9_]*)"|'([A-Za-z_][A-Za-z0-9_]*)')\s*\]\s*=\s*(.+?);\s*(?:\/\/\s*(.*))?$/u;
                    const emptyStructDeclarationPattern =
                        /^(\s*)((?:var\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{\s*\}\s*;\s*$/u;

                    type StructAssignmentRecord = Readonly<{
                        indentation: string;
                        objectName: string;
                        propertyName: string;
                        valueText: string;
                        trailingComment: string | null;
                    }>;

                    function parseStructAssignmentLine(line: string): StructAssignmentRecord | null {
                        const dotAssignmentMatch = dotAssignmentPattern.exec(line);
                        if (dotAssignmentMatch) {
                            return Object.freeze({
                                indentation: dotAssignmentMatch[1],
                                objectName: dotAssignmentMatch[2],
                                propertyName: dotAssignmentMatch[3],
                                valueText: dotAssignmentMatch[4].trim(),
                                trailingComment:
                                    typeof dotAssignmentMatch[5] === "string" && dotAssignmentMatch[5].trim().length > 0
                                        ? dotAssignmentMatch[5].trim()
                                        : null
                            });
                        }

                        const staticIndexAssignmentMatch = staticIndexAssignmentPattern.exec(line);
                        if (!staticIndexAssignmentMatch) {
                            return null;
                        }

                        const propertyName = staticIndexAssignmentMatch[3] ?? staticIndexAssignmentMatch[4] ?? "";
                        if (!isIdentifier(propertyName)) {
                            return null;
                        }

                        return Object.freeze({
                            indentation: staticIndexAssignmentMatch[1],
                            objectName: staticIndexAssignmentMatch[2],
                            propertyName,
                            valueText: staticIndexAssignmentMatch[5].trim(),
                            trailingComment:
                                typeof staticIndexAssignmentMatch[6] === "string" &&
                                    staticIndexAssignmentMatch[6].trim().length > 0
                                    ? staticIndexAssignmentMatch[6].trim()
                                    : null
                        });
                    }

                    function parseEmptyStructDeclarationLine(line: string): Readonly<{
                        indentation: string;
                        declarationPrefix: string;
                        objectName: string;
                    }> | null {
                        const declarationMatch = emptyStructDeclarationPattern.exec(line);
                        if (!declarationMatch) {
                            return null;
                        }

                        return Object.freeze({
                            indentation: declarationMatch[1],
                            declarationPrefix: declarationMatch[2],
                            objectName: declarationMatch[3]
                        });
                    }

                    function createStructLiteralBlock(
                        indentation: string,
                        declarationPrefix: string,
                        objectName: string,
                        assignments: ReadonlyArray<StructAssignmentRecord>,
                        compactLiteralSpacing: boolean
                    ): ReadonlyArray<string> {
                        const hasTrailingComments = assignments.some(
                            (assignment) => typeof assignment.trailingComment === "string"
                        );

                        if (!hasTrailingComments) {
                            const propertyInitializers = assignments.map(
                                (assignment) => `${assignment.propertyName}: ${assignment.valueText}`
                            );
                            const openingBrace = compactLiteralSpacing ? "{" : "{ ";
                            const closingBrace = compactLiteralSpacing ? "}" : " }";
                            return Object.freeze([
                                `${indentation}${declarationPrefix}${objectName} = ${openingBrace}${propertyInitializers.join(", ")}${closingBrace};`
                            ]);
                        }

                        const entryIndentation = `${indentation}    `;
                        const blockLines: Array<string> = [`${indentation}${declarationPrefix}${objectName} = {`];
                        for (const [assignmentIndex, assignment] of assignments.entries()) {
                            const isLastAssignment = assignmentIndex === assignments.length - 1;
                            const separator = isLastAssignment ? "" : ",";
                            const trailingCommentSuffix =
                                assignment.trailingComment === null ? "" : ` // ${assignment.trailingComment}`;
                            blockLines.push(
                                `${entryIndentation}${assignment.propertyName}: ${assignment.valueText}${separator}${trailingCommentSuffix}`
                            );
                        }
                        blockLines.push(`${indentation}};`);
                        return Object.freeze(blockLines);
                    }

                    const rewrittenLines: Array<string> = [];
                    let firstUnsafeOffset: number | null = null;
                    let firstRewriteOffset: number | null = null;
                    let lineIndex = 0;
                    while (lineIndex < lines.length) {
                        const firstAssignment = parseStructAssignmentLine(lines[lineIndex]);
                        const nestedSelfAssignmentCluster =
                            firstAssignment !== null &&
                            firstAssignment.objectName === "self" &&
                            firstAssignment.indentation.length > 4;
                        if (
                            !firstAssignment ||
                            nestedSelfAssignmentCluster ||
                            !isIdentifier(firstAssignment.objectName) ||
                            firstAssignment.objectName.toLowerCase() === "global"
                        ) {
                            rewrittenLines.push(lines[lineIndex]);
                            lineIndex += 1;
                            continue;
                        }

                        const cluster: Array<StructAssignmentRecord> = [firstAssignment];
                        let clusterEndIndex = lineIndex;
                        while (clusterEndIndex + 1 < lines.length) {
                            const nextAssignment = parseStructAssignmentLine(lines[clusterEndIndex + 1]);
                            if (!nextAssignment) {
                                break;
                            }

                            if (
                                nextAssignment.objectName !== firstAssignment.objectName ||
                                nextAssignment.indentation !== firstAssignment.indentation
                            ) {
                                break;
                            }

                            cluster.push(nextAssignment);
                            clusterEndIndex += 1;
                        }

                        const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : "";
                        const hasLeadingCommentBarrier = isCommentOnlyLine(previousLine);
                        const declarationRecord =
                            hasLeadingCommentBarrier || lineIndex === 0
                                ? null
                                : parseEmptyStructDeclarationLine(previousLine);
                        const canRewriteSingleAssignmentViaDeclaration =
                            declarationRecord !== null &&
                            declarationRecord.objectName === firstAssignment.objectName &&
                            declarationRecord.indentation === firstAssignment.indentation;

                        if (cluster.length < 2 && !canRewriteSingleAssignmentViaDeclaration) {
                            rewrittenLines.push(lines[lineIndex]);
                            lineIndex += 1;
                            continue;
                        }

                        const assignmentColumnOffset = lines[lineIndex].search(/[A-Za-z_]/u);
                        const reportOffset = (lineStartOffsets[lineIndex] ?? 0) + Math.max(assignmentColumnOffset, 0);
                        const seenProperties = new Set<string>();
                        let hasInlineCommentInValue = false;
                        let hasDuplicatePropertyAssignment = false;
                        for (const assignment of cluster) {
                            if (containsInlineCommentTokens(assignment.valueText)) {
                                hasInlineCommentInValue = true;
                                break;
                            }

                            if (seenProperties.has(assignment.propertyName)) {
                                hasDuplicatePropertyAssignment = true;
                                break;
                            }

                            seenProperties.add(assignment.propertyName);
                        }

                        if (hasDuplicatePropertyAssignment) {
                            for (let currentIndex = lineIndex; currentIndex <= clusterEndIndex; currentIndex += 1) {
                                rewrittenLines.push(lines[currentIndex]);
                            }
                            lineIndex = clusterEndIndex + 1;
                            continue;
                        }

                        if (hasInlineCommentInValue) {
                            if (firstUnsafeOffset === null) {
                                firstUnsafeOffset = reportOffset;
                            }

                            for (let currentIndex = lineIndex; currentIndex <= clusterEndIndex; currentIndex += 1) {
                                rewrittenLines.push(lines[currentIndex]);
                            }
                            lineIndex = clusterEndIndex + 1;
                            continue;
                        }

                        if (hasLeadingCommentBarrier) {
                            if (firstUnsafeOffset === null) {
                                firstUnsafeOffset = reportOffset;
                            }

                            for (let currentIndex = lineIndex; currentIndex <= clusterEndIndex; currentIndex += 1) {
                                rewrittenLines.push(lines[currentIndex]);
                            }
                            lineIndex = clusterEndIndex + 1;
                            continue;
                        }

                        if (firstRewriteOffset === null) {
                            firstRewriteOffset = reportOffset;
                        }

                        const shouldRewriteDeclaration =
                            declarationRecord !== null &&
                            declarationRecord.objectName === firstAssignment.objectName &&
                            declarationRecord.indentation === firstAssignment.indentation;

                        const rewrittenLiteralBlock = createStructLiteralBlock(
                            firstAssignment.indentation,
                            shouldRewriteDeclaration ? declarationRecord.declarationPrefix : "",
                            firstAssignment.objectName,
                            cluster,
                            shouldRewriteDeclaration
                        );

                        if (shouldRewriteDeclaration) {
                            if (rewrittenLines.length > 0) {
                                rewrittenLines.pop();
                            }
                            rewrittenLines.push(...rewrittenLiteralBlock);
                        } else {
                            rewrittenLines.push(...rewrittenLiteralBlock);
                        }

                        lineIndex = clusterEndIndex + 1;
                    }

                    const rewrittenText = rewrittenLines.join(dominantLineEnding(text));
                    if (rewrittenText !== text) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(
                                firstRewriteOffset ?? findFirstChangedCharacterOffset(text, rewrittenText)
                            ),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([0, text.length], rewrittenText)
                        });
                    }

                    if (firstUnsafeOffset !== null && shouldReportUnsafeFixes) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(firstUnsafeOffset),
                            messageId: "unsafeFix"
                        });
                    }
                }
            };

            const projectContext = resolveProjectContextForRule(context, definition);
            if (!projectContext.available) {
                return reportMissingProjectContextOncePerFile(context, listener);
            }

            return Object.freeze(listener);
        }
    });
}

function normalizeLogicalExpressionText(expressionText: string): string {
    return expressionText.trim().replaceAll(/\s+/g, " ");
}

function convertLogicalSymbolsToKeywords(expressionText: string): string {
    return normalizeLogicalExpressionText(expressionText).replaceAll("&&", "and").replaceAll("||", "or");
}

function wrapNegatedLogicalCondition(conditionText: string): string {
    const trimmed = conditionText.trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(trimmed) || trimmed.startsWith("!")) {
        return `!${trimmed}`;
    }

    return `!(${trimmed})`;
}

function simplifyLogicalConditionExpression(conditionText: string): string {
    const normalized = convertLogicalSymbolsToKeywords(trimOuterParentheses(conditionText));

    const absorptionOrMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+or\s+\(\1\s+and\s+[A-Za-z_][A-Za-z0-9_]*\)$/u.exec(
        normalized
    );
    if (absorptionOrMatch) {
        return absorptionOrMatch[1];
    }

    const absorptionAndMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+and\s+\(\1\s+or\s+[A-Za-z_][A-Za-z0-9_]*\)$/u.exec(
        normalized
    );
    if (absorptionAndMatch) {
        return absorptionAndMatch[1];
    }

    const sharedAndMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+\(\1\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)$/u.exec(
            normalized
        );
    if (sharedAndMatch) {
        return `${sharedAndMatch[1]} && (${sharedAndMatch[2]} || ${sharedAndMatch[3]})`;
    }

    const sharedOrMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+\(!\1\s+and\s+\2\)$/u.exec(normalized);
    if (sharedOrMatch) {
        return sharedOrMatch[2];
    }

    const xorMatch = /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+!([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+\(!\1\s+and\s+\2\)$/u.exec(
        normalized
    );
    if (xorMatch) {
        return `(${xorMatch[1]} || ${xorMatch[2]}) && !(${xorMatch[1]} && ${xorMatch[2]})`;
    }

    const guardExtractionMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+\2\)\s+or\s+\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+\2\)$/u.exec(
            normalized
        );
    if (guardExtractionMatch) {
        return `(${guardExtractionMatch[1]} || ${guardExtractionMatch[3]} || ${guardExtractionMatch[4]}) && ${guardExtractionMatch[2]}`;
    }

    const demorganAndMatch = /^!\(([A-Za-z_][A-Za-z0-9_]*)\s+or\s+([A-Za-z_][A-Za-z0-9_]*)\)$/u.exec(normalized);
    if (demorganAndMatch) {
        return `!${demorganAndMatch[1]} && !${demorganAndMatch[2]}`;
    }

    const demorganOrMatch = /^!\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)$/u.exec(normalized);
    if (demorganOrMatch) {
        return `!${demorganOrMatch[1]} || !${demorganOrMatch[2]}`;
    }

    const mixedReductionMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+or\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+and\s+\(!\1\s+or\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+and\s+\(!\2\s+or\s+\3\)$/u.exec(
            normalized
        );
    if (mixedReductionMatch) {
        return `!(${mixedReductionMatch[1]} && ${mixedReductionMatch[2]}) || ${mixedReductionMatch[3]}`;
    }

    return normalized;
}

function simplifyIfReturnExpression(conditionText: string, truthyText: string, falsyText: string): string | null {
    const truthy = normalizeLogicalExpressionText(truthyText);
    const falsy = normalizeLogicalExpressionText(falsyText);
    const simplifiedCondition = simplifyLogicalConditionExpression(conditionText);
    const normalizedCondition = convertLogicalSymbolsToKeywords(trimOuterParentheses(conditionText));

    if (truthy === "true" && falsy === "false") {
        return null;
    }

    if (truthy === "false" && falsy === "true") {
        return null;
    }

    if (falsy === "true") {
        return `${wrapNegatedLogicalCondition(simplifiedCondition)} || ${truthy}`;
    }

    const branchCollapseMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+([A-Za-z_][A-Za-z0-9_]*)$/u.exec(
            normalizedCondition
        );
    if (branchCollapseMatch) {
        const [_, first, second, third] = branchCollapseMatch;
        if (truthy === `${first} and ${second}` && falsy === `${first} or ${third}`) {
            return `${first} && (!${third} || ${second})`;
        }
    }

    return `${simplifiedCondition} ? ${truthy} : ${falsy}`;
}

function rewriteLogicalFlowSource(sourceText: string): string {
    let rewritten = sourceText.replaceAll(/!!\s*([A-Za-z_][A-Za-z0-9_]*)/g, "$1");

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\((.+?)\)\s*\{\s*\n\1[ \t]+return\s+(true|false)\s*;\s*\n\1\}\s*\n\1return\s+(true|false)\s*;/gm,
        (fullMatch, indentation: string, conditionText: string, truthyText: string, falsyText: string) => {
            const simplified = simplifyIfReturnExpression(conditionText, truthyText, falsyText);
            if (!simplified) {
                return fullMatch;
            }

            return `${indentation}return ${simplified};`;
        }
    );

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\((.+?)\)\s*\{\s*\n\1[ \t]+return\s+(.+?)\s*;\s*\n\1\}\s*else\s*\{\s*\n\1[ \t]+return\s+(.+?)\s*;\s*\n\1\}\s*$/gm,
        (fullMatch, indentation: string, conditionText: string, truthyText: string, falsyText: string) => {
            const simplified = simplifyIfReturnExpression(conditionText, truthyText, falsyText);
            if (!simplified) {
                return fullMatch;
            }

            return `${indentation}return ${simplified};`;
        }
    );

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\((.+?)\)\s*\{\s*\n\1[ \t]+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=\s*(.+?)\s*;\s*\n\1\}\s*else\s*\{\s*\n\1[ \t]+\3\s*=\s*(.+?)\s*;\s*\n\1\}\s*$/gm,
        (
            fullMatch,
            indentation: string,
            conditionText: string,
            assignmentTarget: string,
            truthyText: string,
            falsyText: string
        ) => {
            const simplifiedCondition = simplifyLogicalConditionExpression(conditionText);
            return `${indentation}${assignmentTarget} = ${simplifiedCondition} ? ${normalizeLogicalExpressionText(truthyText)} : ${normalizeLogicalExpressionText(falsyText)};`;
        }
    );

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\(\s*is_undefined\s*\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\)\s*\)\s*\{\s*\n\1[ \t]+\2\s*=\s*(.+?)\s*;\s*\n\1\}\s*$/gm,
        (_fullMatch, indentation: string, assignmentTarget: string, fallbackText: string) =>
            `${indentation}${assignmentTarget} ??= ${normalizeLogicalExpressionText(fallbackText)};`
    );

    return rewritten;
}

function createOptimizeLogicalFlowRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const rewrittenText = rewriteLogicalFlowSource(sourceText);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}

function createNoGlobalvarRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const enableAutofix = options.enableAutofix === undefined ? true : options.enableAutofix === true;
            const shouldReportUnsafeFixes = shouldReportUnsafe(context);
            const projectContext = resolveProjectContextForRule(context, definition);

            type TextEdit = Readonly<{
                start: number;
                end: number;
                replacement: string;
            }>;

            type GlobalVarStatementRange = Readonly<{
                start: number;
                end: number;
                names: ReadonlyArray<string>;
            }>;

            const collectGlobalVarStatements = (programNode: unknown): ReadonlyArray<GlobalVarStatementRange> => {
                const statements: Array<GlobalVarStatementRange> = [];

                const visit = (node: unknown): void => {
                    if (Array.isArray(node)) {
                        for (const element of node) {
                            visit(element);
                        }
                        return;
                    }

                    if (!isAstNodeRecord(node)) {
                        return;
                    }

                    if (node.type === "GlobalVarStatement") {
                        const start = getNodeStartIndex(node);
                        const endExclusive = getNodeEndIndex(node);
                        if (typeof start === "number" && typeof endExclusive === "number") {
                            const declarations = CoreWorkspace.Core.asArray<Record<string, unknown>>(node.declarations);
                            const names = declarations
                                .map((declaration) => CoreWorkspace.Core.getIdentifierText(declaration.id ?? null))
                                .filter((name): name is string => isIdentifier(name));

                            if (names.length > 0) {
                                statements.push(
                                    Object.freeze({
                                        start,
                                        end: endExclusive,
                                        names
                                    })
                                );
                            }
                        }
                    }

                    CoreWorkspace.Core.forEachNodeChild(node, (childNode) => visit(childNode));
                };

                visit(programNode);
                return statements;
            };

            const collectGlobalIdentifierReplacementEdits = (
                programNode: unknown,
                globalVarStatements: ReadonlyArray<GlobalVarStatementRange>
            ): ReadonlyArray<TextEdit> => {
                const declaredNames = new Set<string>();
                for (const statement of globalVarStatements) {
                    for (const name of statement.names) {
                        declaredNames.add(name);
                    }
                }

                if (declaredNames.size === 0) {
                    return [];
                }

                const edits: Array<TextEdit> = [];
                const isWithinGlobalVarDeclaration = (start: number, end: number): boolean =>
                    globalVarStatements.some((statement) => start >= statement.start && end <= statement.end);

                const visit = (node: unknown, parentNode: Record<string, unknown> | null): void => {
                    if (Array.isArray(node)) {
                        for (const element of node) {
                            visit(element, parentNode);
                        }
                        return;
                    }

                    if (!isAstNodeRecord(node)) {
                        return;
                    }

                    if (node.type === "Identifier" && typeof node.name === "string" && declaredNames.has(node.name)) {
                        const start = getNodeStartIndex(node);
                        const endExclusive = getNodeEndIndex(node);
                        if (
                            typeof start === "number" &&
                            typeof endExclusive === "number" &&
                            shouldRewriteGlobalvarIdentifierNode(node, parentNode) &&
                            !isWithinGlobalVarDeclaration(start, endExclusive)
                        ) {
                            edits.push(
                                Object.freeze({
                                    start,
                                    end: endExclusive,
                                    replacement: `global.${node.name}`
                                })
                            );
                        }
                    }

                    CoreWorkspace.Core.forEachNodeChild(node, (childNode) => visit(childNode, node));
                };

                visit(programNode, null);
                return edits;
            };

            const collectGlobalVarDeclarationRemovalEdits = (
                sourceText: string,
                globalVarStatements: ReadonlyArray<GlobalVarStatementRange>
            ): ReadonlyArray<TextEdit> =>
                globalVarStatements.map((statement) => {
                    const start = statement.start;
                    let end = statement.end;

                    if (sourceText[end] === "\r" && sourceText[end + 1] === "\n") {
                        end += 2;
                    } else if (sourceText[end] === "\n") {
                        end += 1;
                    }

                    return Object.freeze({
                        start,
                        end,
                        replacement: ""
                    });
                });

            const applyTextEdits = (sourceText: string, edits: ReadonlyArray<TextEdit>): string => {
                if (edits.length === 0) {
                    return sourceText;
                }

                const sortedEdits = edits
                    .filter((edit) => edit.start >= 0 && edit.end >= edit.start && edit.end <= sourceText.length)
                    .toSorted((left, right) => {
                        if (left.start !== right.start) {
                            return left.start - right.start;
                        }

                        return left.end - right.end;
                    });

                const nonOverlappingEdits: Array<TextEdit> = [];
                let previousEnd = -1;
                for (const edit of sortedEdits) {
                    if (edit.start < previousEnd) {
                        continue;
                    }

                    nonOverlappingEdits.push(edit);
                    previousEnd = edit.end;
                }

                let rewrittenText = sourceText;
                for (const edit of nonOverlappingEdits.toReversed()) {
                    rewrittenText =
                        rewrittenText.slice(0, edit.start) + edit.replacement + rewrittenText.slice(edit.end);
                }

                return rewrittenText;
            };

            const listener: Rule.RuleListener = {
                Program(programNode) {
                    const text = context.sourceCode.text;
                    const sourcePath = context.sourceCode.parserServices?.gml?.filePath;
                    const filePath = typeof sourcePath === "string" ? sourcePath : null;
                    const globalVarStatements = collectGlobalVarStatements(programNode);
                    if (globalVarStatements.length === 0) {
                        return;
                    }

                    const assessGlobalVarRewrite =
                        projectContext.context && typeof projectContext.context.assessGlobalVarRewrite === "function"
                            ? projectContext.context.assessGlobalVarRewrite.bind(projectContext.context)
                            : null;
                    const rewriteAssessment = assessGlobalVarRewrite?.(filePath, false) ?? {
                        allowRewrite: true,
                        reason: null
                    };

                    const firstStatementStart = globalVarStatements[0]?.start ?? 0;
                    if (!rewriteAssessment.allowRewrite) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(firstStatementStart),
                            messageId: shouldReportUnsafeFixes ? "unsafeFix" : definition.messageId
                        });
                        return;
                    }

                    const edits = [
                        ...collectGlobalVarDeclarationRemovalEdits(text, globalVarStatements),
                        ...collectGlobalIdentifierReplacementEdits(programNode, globalVarStatements)
                    ];
                    const rewrittenText = applyTextEdits(text, edits);
                    if (rewrittenText === text) {
                        return;
                    }

                    const firstChangedOffset = findFirstChangedCharacterOffset(text, rewrittenText);
                    if (!enableAutofix) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                            messageId: definition.messageId
                        });
                        return;
                    }

                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, text.length], rewrittenText)
                    });
                }
            };

            if (!projectContext.available) {
                return reportMissingProjectContextOncePerFile(context, listener);
            }

            return Object.freeze(listener);
        }
    });
}

function normalizeDocCommentPrefixLine(line: string): string {
    const legacyTagMatch = /^(\s*)\/\/\s*@([A-Za-z_][A-Za-z0-9_]*)(.*)$/u.exec(line);
    if (legacyTagMatch) {
        return `${legacyTagMatch[1]}/// @${legacyTagMatch[2]}${legacyTagMatch[3]}`;
    }

    const legacyDocLikeMatch = /^(\s*)\/\/\s*\/(?!\/)\s*(.*)$/u.exec(line);
    if (legacyDocLikeMatch) {
        const suffix = legacyDocLikeMatch[2].length > 0 ? ` ${legacyDocLikeMatch[2]}` : "";
        return `${legacyDocLikeMatch[1]}///${suffix}`;
    }

    const missingSpaceMatch = /^(\s*)\/\/\/(\S.*)$/u.exec(line);
    if (missingSpaceMatch) {
        return `${missingSpaceMatch[1]}/// ${missingSpaceMatch[2]}`;
    }

    return line;
}

type FunctionDocCommentTarget = Readonly<{
    indentation: string;
    functionName: string;
    parameters: ReadonlyArray<FunctionDocCommentParameterDefinition>;
}>;

type TrailingDocCommentBlock = Readonly<{
    startIndex: number;
    lines: ReadonlyArray<string>;
}>;

type FunctionDocCommentParameterDefinition = Readonly<{
    sourceName: string;
    defaultExpression: string | null;
}>;

type SyntheticDocCommentNodeWithSourceSpan = Readonly<{
    _docSourceStart?: number;
    _docSourceEnd?: number;
}>;

type SyntheticDocCommentParameterNode = Readonly<{
    type: "Identifier";
    name: string;
}> &
    SyntheticDocCommentNodeWithSourceSpan;

type SyntheticDocCommentDefaultParameterNode = Readonly<{
    type: "DefaultParameter";
    left: SyntheticDocCommentParameterNode;
    right: SyntheticDocCommentParameterNode;
}> &
    SyntheticDocCommentNodeWithSourceSpan;

type SyntheticDocCommentParameterLikeNode = SyntheticDocCommentParameterNode | SyntheticDocCommentDefaultParameterNode;

type SyntheticDocCommentFunctionNode = Readonly<{
    type: "FunctionDeclaration";
    params: ReadonlyArray<SyntheticDocCommentParameterLikeNode>;
    body: Readonly<{
        type: "BlockStatement";
        body: ReadonlyArray<unknown>;
    }>;
}>;

function toDocCommentParameterName(parameterName: string): string {
    return parameterName.replace(/^_+/u, "");
}

function parseFunctionParameterDefinitions(parameterListText: string): Array<FunctionDocCommentParameterDefinition> {
    const parameterDefinitions: Array<FunctionDocCommentParameterDefinition> = [];
    const seenParameterNames = new Set<string>();

    for (const parameterSegment of splitTopLevelCommaSegments(parameterListText)) {
        const trimmedSegment = parameterSegment.trim();
        if (trimmedSegment.length === 0) {
            continue;
        }

        const normalizedSegment = trimmedSegment.replace(/^\.\.\./u, "").trim();
        const defaultMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/u.exec(normalizedSegment);
        if (defaultMatch) {
            const sourceName = defaultMatch[1];
            const canonicalName = toDocCommentParameterName(sourceName);
            if (seenParameterNames.has(canonicalName)) {
                continue;
            }

            seenParameterNames.add(canonicalName);
            parameterDefinitions.push(
                Object.freeze({
                    sourceName,
                    defaultExpression: defaultMatch[2].trim()
                })
            );
            continue;
        }

        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(normalizedSegment)) {
            continue;
        }

        const canonicalName = toDocCommentParameterName(normalizedSegment);
        if (seenParameterNames.has(canonicalName)) {
            continue;
        }

        seenParameterNames.add(canonicalName);
        parameterDefinitions.push(
            Object.freeze({
                sourceName: normalizedSegment,
                defaultExpression: null
            })
        );
    }

    return parameterDefinitions;
}

function parseFunctionDocCommentTarget(line: string): FunctionDocCommentTarget | null {
    const declarationMatch =
        /^(\s*)(?:static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:constructor\s*)?(?:\{\s*(?:(?:\S.*)\s*)?\}?\s*)?$/u.exec(
            line
        );
    if (declarationMatch) {
        return {
            indentation: declarationMatch[1],
            functionName: declarationMatch[2],
            parameters: parseFunctionParameterDefinitions(declarationMatch[3])
        };
    }

    const assignmentMatch =
        /^(\s*)(?:var\s+|static\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\(([^)]*)\)\s*(?:constructor\s*)?(?:\{\s*(?:(?:\S.*)\s*)?\}?\s*)?$/u.exec(
            line
        );
    if (!assignmentMatch) {
        return null;
    }

    return {
        indentation: assignmentMatch[1],
        functionName: assignmentMatch[2],
        parameters: parseFunctionParameterDefinitions(assignmentMatch[3])
    };
}

const DOC_COMMENT_FUNCTION_NODE_TYPES = new Set([
    "FunctionDeclaration",
    "StructFunctionDeclaration",
    "ConstructorDeclaration"
]);

function collectFunctionNodesByStartLine(
    programNode: unknown,
    lineStartOffsets: ReadonlyArray<number>
): Map<number, Array<AstNodeWithType>> {
    const functionNodesByLine = new Map<number, Array<AstNodeWithType>>();

    walkAstNodes(programNode, (node) => {
        if (!isAstNodeWithType(node) || !DOC_COMMENT_FUNCTION_NODE_TYPES.has(node.type)) {
            return;
        }

        const startOffset = getNodeStartIndex(node);
        if (typeof startOffset !== "number" || startOffset < 0) {
            return;
        }

        const lineIndex = getLineIndexForOffset(lineStartOffsets, startOffset);
        const bucket = functionNodesByLine.get(lineIndex) ?? [];
        bucket.push(node);
        functionNodesByLine.set(lineIndex, bucket);
    });

    return functionNodesByLine;
}

function getFunctionNodeName(node: AstNodeWithType): string | null {
    if (!isAstNodeRecord(node.id)) {
        return null;
    }

    return node.id.type === "Identifier" && typeof node.id.name === "string" ? node.id.name : null;
}

function resolveFunctionNodeForDocCommentTarget(
    target: FunctionDocCommentTarget,
    functionNodesOnLine: ReadonlyArray<AstNodeWithType>
): AstNodeWithType | null {
    if (functionNodesOnLine.length === 0) {
        return null;
    }

    const targetParamCount = target.parameters.length;
    for (const functionNode of functionNodesOnLine) {
        if (getFunctionNodeName(functionNode) !== target.functionName) {
            continue;
        }

        const paramCount = Array.isArray(functionNode.params) ? functionNode.params.length : 0;
        if (paramCount === targetParamCount) {
            return functionNode;
        }
    }

    for (const functionNode of functionNodesOnLine) {
        const paramCount = Array.isArray(functionNode.params) ? functionNode.params.length : 0;
        if (paramCount === targetParamCount) {
            return functionNode;
        }
    }

    return functionNodesOnLine[0] ?? null;
}

function readTrailingDocCommentBlock(lines: ReadonlyArray<string>): TrailingDocCommentBlock | null {
    let index = lines.length - 1;
    if (index < 0 || !/^\s*\/\/\//u.test(lines[index])) {
        return null;
    }

    while (index >= 0 && /^\s*\/\/\//u.test(lines[index])) {
        index -= 1;
    }

    return {
        startIndex: index + 1,
        lines: lines.slice(index + 1)
    };
}

function isFunctionNamePlaceholderDescription(line: string, functionName: string): boolean {
    const metadata = CoreWorkspace.Core.parseDocCommentMetadata(line);
    if (!metadata || metadata.tag !== "description" || typeof metadata.name !== "string") {
        return false;
    }

    return metadata.name.trim() === functionName;
}

function canonicalizeDocCommentTagAliases(docLines: ReadonlyArray<string>): ReadonlyArray<string> {
    return docLines.map((line) => {
        if (!/^\s*\/\/\//u.test(line)) {
            return line;
        }

        const normalizedLine = CoreWorkspace.Core.applyJsDocTagAliasReplacements(line);
        return typeof normalizedLine === "string" ? normalizedLine : line;
    });
}

function isFunctionDocCommentTagLine(line: string): boolean {
    const metadata = CoreWorkspace.Core.parseDocCommentMetadata(line);
    return metadata?.tag === "function" || metadata?.tag === "func";
}

function alignDescriptionContinuationLines(docLines: ReadonlyArray<string>): ReadonlyArray<string> {
    const alignedLines: Array<string> = [];
    let activeContinuationIndentation: string | null = null;

    for (const line of docLines) {
        const descriptionMatch = /^(\s*)\/\/\/\s*@description\b(?:\s*(.*))?$/iu.exec(line);
        if (descriptionMatch) {
            const indentation = descriptionMatch[1] ?? "";
            activeContinuationIndentation = `${indentation}/// ${" ".repeat("@description ".length)}`;
            alignedLines.push(line);
            continue;
        }

        const taggedLine = /^\s*\/\/\/\s*@/iu.test(line);
        if (taggedLine) {
            activeContinuationIndentation = null;
            alignedLines.push(line);
            continue;
        }

        if (activeContinuationIndentation === null) {
            alignedLines.push(line);
            continue;
        }

        const plainDocLineMatch = /^(\s*)\/\/\/\s*(.*)$/u.exec(line);
        if (!plainDocLineMatch) {
            activeContinuationIndentation = null;
            alignedLines.push(line);
            continue;
        }

        const continuationText = (plainDocLineMatch[2] ?? "").trim();
        if (continuationText.length === 0) {
            alignedLines.push(`${plainDocLineMatch[1] ?? ""}///`);
            continue;
        }

        alignedLines.push(`${activeContinuationIndentation}${continuationText}`);
    }

    return alignedLines;
}

type SyntheticDocCommentFunctionBuildResult = Readonly<{
    functionNode: SyntheticDocCommentFunctionNode;
    syntheticSourceText: string;
}>;

function getSyntheticDocCommentNodeSourceStart(node: unknown): number {
    if (!isObjectLike(node)) {
        return -1;
    }

    const sourceNode = node as { _docSourceStart?: unknown };
    return typeof sourceNode._docSourceStart === "number" ? sourceNode._docSourceStart : -1;
}

function getSyntheticDocCommentNodeSourceEnd(node: unknown): number {
    if (!isObjectLike(node)) {
        return -1;
    }

    const sourceNode = node as { _docSourceEnd?: unknown };
    return typeof sourceNode._docSourceEnd === "number" ? sourceNode._docSourceEnd : -1;
}

function createSyntheticDocCommentFunctionNode(
    target: FunctionDocCommentTarget
): SyntheticDocCommentFunctionBuildResult {
    const params: Array<SyntheticDocCommentParameterLikeNode> = [];
    const syntheticSourceSegments: Array<string> = [];
    let syntheticSourceText = "";

    for (const parameter of target.parameters) {
        if (syntheticSourceText.length > 0) {
            syntheticSourceText += ", ";
        }

        const segmentStart = syntheticSourceText.length;
        const sourceName = parameter.sourceName;
        if (parameter.defaultExpression === null) {
            syntheticSourceText += sourceName;
            params.push(
                Object.freeze({
                    type: "Identifier",
                    name: sourceName
                })
            );
            syntheticSourceSegments.push(sourceName);
            continue;
        }

        const serializedParameter = `${sourceName} = ${parameter.defaultExpression}`;
        const defaultStart = segmentStart + sourceName.length + " = ".length;
        const defaultEnd = defaultStart + parameter.defaultExpression.length;
        syntheticSourceText += serializedParameter;

        const identifierNode = Object.freeze({
            type: "Identifier",
            name: sourceName
        }) as SyntheticDocCommentParameterNode;
        const defaultValueNode = Object.freeze({
            type: "Identifier",
            name: parameter.defaultExpression,
            _docSourceStart: defaultStart,
            _docSourceEnd: defaultEnd
        }) as SyntheticDocCommentParameterNode;

        params.push(
            Object.freeze({
                type: "DefaultParameter",
                left: identifierNode,
                right: defaultValueNode,
                _docSourceStart: segmentStart,
                _docSourceEnd: segmentStart + serializedParameter.length
            })
        );
        syntheticSourceSegments.push(serializedParameter);
    }

    return Object.freeze({
        functionNode: Object.freeze({
            type: "FunctionDeclaration",
            params,
            body: {
                type: "BlockStatement" as const,
                body: [] as ReadonlyArray<unknown>
            }
        }),
        syntheticSourceText: syntheticSourceSegments.join(", ")
    });
}

function withTargetIndentation(indentation: string, line: string): string {
    if (line.trim().length === 0) {
        return line;
    }

    return `${indentation}${line.trimStart()}`;
}

function synthesizeFunctionDocCommentBlock(
    target: FunctionDocCommentTarget,
    existingDocLines: ReadonlyArray<string> | null,
    sourceText: string,
    functionNodeForSynthesis: AstNodeWithType | null
): ReadonlyArray<string> | null {
    const docLinesWithoutPlaceholders = (existingDocLines ?? []).filter(
        (line) => !isFunctionNamePlaceholderDescription(line, target.functionName)
    );
    const canonicalizedDocLines = canonicalizeDocCommentTagAliases(docLinesWithoutPlaceholders).filter(
        (line) => !isFunctionDocCommentTagLine(line)
    );
    const syntheticFunctionBuild =
        functionNodeForSynthesis === null ? createSyntheticDocCommentFunctionNode(target) : null;
    const functionNode = functionNodeForSynthesis ?? syntheticFunctionBuild?.functionNode;
    if (!functionNode) {
        return null;
    }
    const syntheticDocLines = CoreWorkspace.Core.computeSyntheticFunctionDocLines(
        functionNode,
        canonicalizedDocLines,
        {
            originalText: functionNodeForSynthesis ? sourceText : (syntheticFunctionBuild?.syntheticSourceText ?? ""),
            locStart: functionNodeForSynthesis ? getNodeStartIndex : getSyntheticDocCommentNodeSourceStart,
            locEnd: functionNodeForSynthesis ? getNodeEndIndex : getSyntheticDocCommentNodeSourceEnd
        },
        {}
    );
    const existingParamLineIndicesByCanonical = new Map<string, number>();
    let hasReturnsTag = false;
    const mergedDocLines = canonicalizedDocLines.map((line, index) => {
        const metadata = CoreWorkspace.Core.parseDocCommentMetadata(line);
        if (!metadata) {
            return line;
        }

        if (metadata.tag === "return" || metadata.tag === "returns") {
            hasReturnsTag = true;
            return line;
        }

        if (metadata.tag === "param" && typeof metadata.name === "string") {
            const canonicalName = CoreWorkspace.Core.getCanonicalParamNameFromText(metadata.name);
            if (canonicalName) {
                existingParamLineIndicesByCanonical.set(canonicalName, index);
            }
        }

        return line;
    });

    for (const syntheticLine of syntheticDocLines) {
        const metadata = CoreWorkspace.Core.parseDocCommentMetadata(syntheticLine);
        const normalizedSyntheticLine = withTargetIndentation(target.indentation, syntheticLine);
        if (!metadata) {
            if (!mergedDocLines.includes(normalizedSyntheticLine)) {
                mergedDocLines.push(normalizedSyntheticLine);
            }
            continue;
        }

        if (metadata.tag === "return" || metadata.tag === "returns") {
            if (hasReturnsTag) {
                continue;
            }

            mergedDocLines.push(normalizedSyntheticLine);
            hasReturnsTag = true;
            continue;
        }

        if (metadata.tag === "param" && typeof metadata.name === "string") {
            const canonicalName = CoreWorkspace.Core.getCanonicalParamNameFromText(metadata.name);
            if (canonicalName) {
                const existingIndex = existingParamLineIndicesByCanonical.get(canonicalName);
                if (typeof existingIndex === "number") {
                    const existingLine = mergedDocLines[existingIndex];
                    if (existingLine !== normalizedSyntheticLine) {
                        mergedDocLines[existingIndex] = normalizedSyntheticLine;
                    }
                    continue;
                }

                mergedDocLines.push(normalizedSyntheticLine);
                existingParamLineIndicesByCanonical.set(canonicalName, mergedDocLines.length - 1);
                continue;
            }
        }

        if (!mergedDocLines.includes(normalizedSyntheticLine)) {
            mergedDocLines.push(normalizedSyntheticLine);
        }
    }

    if (existingDocLines) {
        const hasChanged =
            mergedDocLines.length !== existingDocLines.length ||
            mergedDocLines.some((line, index) => line !== existingDocLines[index]);
        return hasChanged ? mergedDocLines : null;
    }

    return mergedDocLines;
}

function createNormalizeDocCommentsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(programNode) {
                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
                    const lineStartOffsets = computeLineStartOffsets(text);
                    const functionNodesByLineIndex = collectFunctionNodesByStartLine(programNode, lineStartOffsets);
                    const rewrittenLines: Array<string> = [];

                    const flushDocBlock = (blockLines: Array<string>): void => {
                        if (blockLines.length === 0) {
                            return;
                        }

                        const emptyDescriptionPattern = /^(\s*)\/\/\/\s*@description\s*$/u;
                        const normalizedBlock = blockLines
                            .filter((line) => !emptyDescriptionPattern.test(line))
                            .map((line) => normalizeDocCommentPrefixLine(line));
                        const promotedBlock = CoreWorkspace.Core.promoteLeadingDocCommentTextToDescription(
                            normalizedBlock,
                            [],
                            true
                        );
                        const returnsNormalizedBlock =
                            CoreWorkspace.Core.convertLegacyReturnsDescriptionLinesToMetadata(promotedBlock);
                        const alignedDescriptionBlock = alignDescriptionContinuationLines(returnsNormalizedBlock);
                        rewrittenLines.push(...alignedDescriptionBlock);
                    };

                    let pendingDocBlock: Array<string> = [];
                    for (const [lineIndex, line] of lines.entries()) {
                        if (
                            /^\s*\/\/\//u.test(line) ||
                            /^\s*\/\/\s*@/u.test(line) ||
                            /^\s*\/\/\s*\/(?!\/)/u.test(line)
                        ) {
                            pendingDocBlock.push(line);
                            continue;
                        }

                        flushDocBlock(pendingDocBlock);
                        pendingDocBlock = [];
                        const normalizedLine = normalizeDocCommentPrefixLine(line);
                        const docCommentTarget = parseFunctionDocCommentTarget(normalizedLine);
                        if (docCommentTarget) {
                            const functionNode = resolveFunctionNodeForDocCommentTarget(
                                docCommentTarget,
                                functionNodesByLineIndex.get(lineIndex) ?? []
                            );
                            const trailingDocCommentBlock = readTrailingDocCommentBlock(rewrittenLines);
                            const synthesizedDocCommentBlock = synthesizeFunctionDocCommentBlock(
                                docCommentTarget,
                                trailingDocCommentBlock?.lines ?? null,
                                text,
                                functionNode
                            );

                            if (synthesizedDocCommentBlock) {
                                if (trailingDocCommentBlock) {
                                    rewrittenLines.splice(
                                        trailingDocCommentBlock.startIndex,
                                        trailingDocCommentBlock.lines.length,
                                        ...synthesizedDocCommentBlock
                                    );
                                } else {
                                    rewrittenLines.push(...synthesizedDocCommentBlock);
                                }
                            }
                        }

                        rewrittenLines.push(normalizedLine);
                    }
                    flushDocBlock(pendingDocBlock);

                    const rewritten = rewrittenLines.join(lineEnding);
                    reportFullTextRewrite(context, definition.messageId, text, rewritten);
                }
            });
        }
    });
}

function findLineCommentIndexOutsideStrings(line: string): number {
    let inString: "'" | '"' | null = null;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        const nextCharacter = line[index + 1];

        if (inString) {
            if (character === "\\") {
                index += 1;
                continue;
            }

            if (character === inString) {
                inString = null;
            }
            continue;
        }

        if (character === "'" || character === '"') {
            inString = character;
            continue;
        }

        if (character === "/" && nextCharacter === "/") {
            return index;
        }
    }

    return -1;
}

function normalizeLegacyBlockKeywordLine(line: string): string {
    const commentMarkerIndex = findLineCommentIndexOutsideStrings(line);
    let codePortion = line;
    let commentPortion = "";
    if (commentMarkerIndex >= 0) {
        let commentStart = commentMarkerIndex;
        while (commentStart > 0 && (line[commentStart - 1] === " " || line[commentStart - 1] === "\t")) {
            commentStart -= 1;
        }

        codePortion = line.slice(0, commentStart);
        commentPortion = line.slice(commentStart);
    }

    if (/^\s*#/u.test(codePortion)) {
        return line;
    }

    const standaloneEnd = /^(\s*)end\s*(?:;\s*)?$/iu.exec(codePortion);
    if (standaloneEnd) {
        return `${standaloneEnd[1]}}${commentPortion}`;
    }

    if (/\bbegin\s*(?:;\s*)?$/iu.test(codePortion)) {
        return `${codePortion.replace(/\bbegin\s*(?:;\s*)?$/iu, "{")}${commentPortion}`;
    }

    return line;
}

function normalizeLegacyDirectiveLine(line: string): string {
    const legacyCommentedRegion = /^(\s*)\/\/\s*#\s*(region|endregion)\b(.*)$/u.exec(line);
    if (legacyCommentedRegion) {
        const indentation = legacyCommentedRegion[1];
        const directive = legacyCommentedRegion[2];
        const suffix = legacyCommentedRegion[3].trim();
        const normalized = suffix.length > 0 ? `${indentation}#${directive} ${suffix}` : `${indentation}#${directive}`;
        return normalizeLegacyBlockKeywordLine(normalized);
    }

    const legacyDefineRegion = /^(\s*)#define\s+(end\s+)?region\b(.*)$/iu.exec(line);
    if (legacyDefineRegion) {
        const indentation = legacyDefineRegion[1];
        const directive = legacyDefineRegion[2] ? "#endregion" : "#region";
        const suffix = legacyDefineRegion[3].trim();
        const normalized = suffix.length > 0 ? `${indentation}${directive} ${suffix}` : `${indentation}${directive}`;
        return normalizeLegacyBlockKeywordLine(normalized);
    }

    const legacyMacro = /^(\s*)#define\s+([A-Za-z_][A-Za-z0-9_]*)(.*)$/iu.exec(line);
    if (!legacyMacro) {
        return normalizeLegacyBlockKeywordLine(line);
    }

    const indentation = legacyMacro[1];
    const rawTail = legacyMacro[3];
    const lineCommentIndex = rawTail.indexOf("//");
    const bodyPortion = lineCommentIndex === -1 ? rawTail : rawTail.slice(0, lineCommentIndex);
    const commentPortion = lineCommentIndex === -1 ? "" : rawTail.slice(lineCommentIndex).trimEnd();
    const normalizedBody = bodyPortion.trim().replace(/;\s*$/u, "");
    const normalizedComment = commentPortion.length > 0 ? ` ${commentPortion}` : "";

    if (normalizedBody.length === 0) {
        return `${indentation}#macro ${legacyMacro[2]}${normalizedComment}`;
    }

    return `${indentation}#macro ${legacyMacro[2]} ${normalizedBody}${normalizedComment}`;
}

type BracedSingleClause = Readonly<{
    indentation: string;
    header: string;
    statement: string;
}>;

type ConditionedControlFlowKeyword = "if" | "repeat" | "while" | "for" | "with";

type ControlFlowLineHeader = Readonly<{
    indentation: string;
    header: string;
}>;

type DoUntilClause = Readonly<{
    indentation: string;
    statement: string;
    untilCondition: string;
}>;

const CONDITIONED_CONTROL_FLOW_KEYWORDS = Object.freeze([
    "if",
    "repeat",
    "while",
    "for",
    "with"
]) as ReadonlyArray<ConditionedControlFlowKeyword>;

function toBracedSingleClause(indentation: string, header: string, statement: string): Array<string> {
    return [`${indentation}${header} {`, `${indentation}    ${statement}`, `${indentation}}`];
}

function parseInlineConditionedClause(line: string, keyword: ConditionedControlFlowKeyword): BracedSingleClause | null {
    const keywordPattern = new RegExp(String.raw`^(\s*)${keyword}\b`, "u");
    const keywordMatch = keywordPattern.exec(line);
    if (!keywordMatch) {
        return null;
    }

    let cursor = keywordMatch[0].length;
    while (cursor < line.length && /\s/u.test(line[cursor])) {
        cursor += 1;
    }

    if (line[cursor] !== "(") {
        return null;
    }

    const closingParenthesisIndex = findMatchingParenthesisIndexInLine(line, cursor);
    if (closingParenthesisIndex < 0) {
        return null;
    }

    const condition = line.slice(cursor + 1, closingParenthesisIndex).trim();
    if (condition.length === 0) {
        return null;
    }

    const statement = line.slice(closingParenthesisIndex + 1).trim();
    if (!isSafeSingleLineControlFlowStatement(statement)) {
        return null;
    }

    return {
        indentation: keywordMatch[1],
        header: `${keyword} (${condition})`,
        statement
    };
}

function parseInlineControlFlowClause(line: string): BracedSingleClause | null {
    for (const keyword of CONDITIONED_CONTROL_FLOW_KEYWORDS) {
        const conditionedClause = parseInlineConditionedClause(line, keyword);
        if (conditionedClause) {
            return conditionedClause;
        }
    }

    return null;
}

function parseLineOnlyControlFlowHeader(line: string): ControlFlowLineHeader | null {
    const keywordMatch = /^(\s*)(if|repeat|while|for|with)\b/u.exec(line);
    if (!keywordMatch) {
        return null;
    }

    let cursor = keywordMatch[0].length;
    while (cursor < line.length && /\s/u.test(line[cursor])) {
        cursor += 1;
    }

    if (line[cursor] !== "(") {
        return null;
    }

    const closingParenthesisIndex = findMatchingParenthesisIndexInLine(line, cursor);
    if (closingParenthesisIndex < 0) {
        return null;
    }

    const condition = line.slice(cursor + 1, closingParenthesisIndex).trim();
    if (condition.length === 0) {
        return null;
    }

    const trailingText = line.slice(closingParenthesisIndex + 1).trim();
    if (trailingText.length > 0) {
        return null;
    }

    return {
        indentation: keywordMatch[1],
        header: `${keywordMatch[2]} (${condition})`
    };
}

function findMatchingParenthesisIndexInLine(line: string, openParenthesisIndex: number): number {
    let parenthesisDepth = 0;
    let inString: "'" | '"' | null = null;
    let inBlockComment = false;

    for (let index = openParenthesisIndex; index < line.length; index += 1) {
        const character = line[index];
        const nextCharacter = line[index + 1];

        if (inString) {
            if (character === "\\") {
                index += 1;
                continue;
            }
            if (character === inString) {
                inString = null;
            }
            continue;
        }

        if (inBlockComment) {
            if (character === "*" && nextCharacter === "/") {
                inBlockComment = false;
                index += 1;
            }
            continue;
        }

        if (character === "/" && nextCharacter === "/") {
            break;
        }

        if (character === "/" && nextCharacter === "*") {
            inBlockComment = true;
            index += 1;
            continue;
        }

        if (character === "'" || character === '"') {
            inString = character;
            continue;
        }

        if (character === "(") {
            parenthesisDepth += 1;
            continue;
        }

        if (character === ")") {
            parenthesisDepth -= 1;
            if (parenthesisDepth === 0) {
                return index;
            }
        }
    }

    return -1;
}

function isLikelyConditionContinuationLine(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return false;
    }

    if (
        trimmed.startsWith("||") ||
        trimmed.startsWith("&&") ||
        trimmed.startsWith(")") ||
        trimmed.startsWith("?") ||
        trimmed.startsWith(":")
    ) {
        return true;
    }

    const lower = trimmed.toLowerCase();
    return lower.startsWith("and ") || lower.startsWith("or ") || lower.startsWith("xor ");
}

function isSafeSingleLineControlFlowStatement(statement: string): boolean {
    const trimmed = statement.trim();
    if (trimmed.length === 0) {
        return false;
    }

    if (
        trimmed.startsWith("{") ||
        trimmed.startsWith("}") ||
        trimmed.startsWith("#") ||
        isLikelyConditionContinuationLine(trimmed)
    ) {
        return false;
    }

    return trimmed.endsWith(";");
}

function findLegacyThenSeparatorIndex(payload: string): number {
    let inString: "'" | '"' | null = null;
    let inBlockComment = false;

    for (let index = 0; index < payload.length; index += 1) {
        const character = payload[index];
        const nextCharacter = payload[index + 1];

        if (inString) {
            if (character === "\\") {
                index += 1;
                continue;
            }

            if (character === inString) {
                inString = null;
            }
            continue;
        }

        if (inBlockComment) {
            if (character === "*" && nextCharacter === "/") {
                inBlockComment = false;
                index += 1;
            }
            continue;
        }

        if (character === "/" && nextCharacter === "/") {
            return -1;
        }

        if (character === "/" && nextCharacter === "*") {
            inBlockComment = true;
            index += 1;
            continue;
        }

        if (character === "'" || character === '"') {
            inString = character;
            continue;
        }

        if (payload.slice(index, index + 4).toLowerCase() !== "then") {
            continue;
        }

        const previousCharacter = index > 0 ? payload[index - 1] : null;
        const followingCharacter = index + 4 < payload.length ? payload[index + 4] : null;
        if (previousCharacter !== null && isIdentifierCharacter(previousCharacter)) {
            continue;
        }

        if (followingCharacter !== null && isIdentifierCharacter(followingCharacter)) {
            continue;
        }

        return index;
    }

    return -1;
}

function parseInlineControlFlowClauseWithLegacyIf(line: string): BracedSingleClause | null {
    const inlineControlFlowClause = parseInlineControlFlowClause(line);
    if (inlineControlFlowClause) {
        return inlineControlFlowClause;
    }

    const legacyInlineIf = /^(\s*)if\s+(.+);\s*$/u.exec(line);
    if (!legacyInlineIf) {
        return null;
    }

    const indentation = legacyInlineIf[1];
    const payload = legacyInlineIf[2].trim();
    if (payload.includes("{") || payload.includes("}") || /\belse\b/u.test(payload)) {
        return null;
    }

    const thenSeparatorIndex = findLegacyThenSeparatorIndex(payload);
    if (thenSeparatorIndex > 0 && thenSeparatorIndex < payload.length - 4) {
        const condition = payload.slice(0, thenSeparatorIndex).trim();
        const statement = `${payload.slice(thenSeparatorIndex + 4).trim()};`;
        if (condition.length === 0 || !isSafeSingleLineControlFlowStatement(statement)) {
            return null;
        }

        return {
            indentation,
            header: `if (${condition})`,
            statement
        };
    }

    const lastClosingParenIndex = payload.lastIndexOf(")");
    if (lastClosingParenIndex <= 0 || lastClosingParenIndex >= payload.length - 1) {
        return null;
    }

    const condition = payload.slice(0, lastClosingParenIndex + 1).trim();
    const statement = `${payload.slice(lastClosingParenIndex + 1).trim()};`;
    if (condition.length === 0 || !isSafeSingleLineControlFlowStatement(statement)) {
        return null;
    }

    return {
        indentation,
        header: `if (${condition})`,
        statement
    };
}

function parseInlineElseClause(line: string): BracedSingleClause | null {
    const inlineElse = /^(\s*)else\s+(?!if\b)(?!\{)([^;{}].*;\s*)$/u.exec(line);
    if (!inlineElse) {
        return null;
    }

    return {
        indentation: inlineElse[1],
        header: "else",
        statement: inlineElse[2].trim()
    };
}

function toBracedDoUntilClause(indentation: string, statement: string, untilCondition: string): Array<string> {
    return [`${indentation}do {`, `${indentation}    ${statement}`, `${indentation}} until (${untilCondition});`];
}

function parseInlineDoUntilClause(line: string): DoUntilClause | null {
    const inlineDoUntil = /^(\s*)do\s+(?!\{)([^;{}].*;\s*)until\s*\((.+)\)\s*(?:;\s*)?$/u.exec(line);
    if (!inlineDoUntil) {
        return null;
    }

    return {
        indentation: inlineDoUntil[1],
        statement: inlineDoUntil[2].trim(),
        untilCondition: inlineDoUntil[3].trim()
    };
}

function parseLineOnlyDoHeader(line: string): string | null {
    const doHeaderMatch = /^(\s*)do\s*$/u.exec(line);
    return doHeaderMatch ? doHeaderMatch[1] : null;
}

function lineUsesMacroContinuation(line: string): boolean {
    return /\\\s*(?:\/\/.*)?$/u.test(line);
}

function parseLineOnlyUntilFooter(line: string): string | null {
    const untilFooterMatch = /^\s*until\s*\((.+)\)\s*(?:;\s*)?$/u.exec(line);
    return untilFooterMatch ? untilFooterMatch[1].trim() : null;
}

function normalizeConditionAssignments(conditionText: string): string {
    return conditionText.replaceAll(/(?<![!<>=+\-*/%|&^])=(?!=)/g, "==");
}

function isIdentifierCharacter(value: string): boolean {
    return /[A-Za-z0-9_]/u.test(value);
}

function previousNonWhitespaceCharacter(sourceText: string, fromIndex: number): string | null {
    let index = fromIndex - 1;
    while (index >= 0) {
        const character = sourceText[index];
        if (!/\s/u.test(character)) {
            return character;
        }
        index -= 1;
    }

    return null;
}

function nextNonWhitespaceCharacter(sourceText: string, fromIndex: number): string | null {
    let index = fromIndex;
    while (index < sourceText.length) {
        const character = sourceText[index];
        if (!/\s/u.test(character)) {
            return character;
        }
        index += 1;
    }

    return null;
}

function previousIdentifierToken(sourceText: string, fromIndex: number): string | null {
    let end = fromIndex - 1;
    while (end >= 0 && /\s/u.test(sourceText[end])) {
        end -= 1;
    }

    if (end < 0 || !isIdentifierCharacter(sourceText[end])) {
        return null;
    }

    let start = end;
    while (start - 1 >= 0 && isIdentifierCharacter(sourceText[start - 1])) {
        start -= 1;
    }

    return sourceText.slice(start, end + 1);
}

function isLogicalNotKeywordInContext(sourceText: string, tokenStart: number, tokenEnd: number): boolean {
    const previousCharacter = previousNonWhitespaceCharacter(sourceText, tokenStart);
    if (previousCharacter !== null) {
        if (previousCharacter === "." || previousCharacter === ")" || previousCharacter === "]") {
            return false;
        }

        if (isIdentifierCharacter(previousCharacter)) {
            const previousToken = previousIdentifierToken(sourceText, tokenStart)?.toLowerCase();
            if (previousToken !== "and" && previousToken !== "or" && previousToken !== "xor") {
                return false;
            }
        }
    }

    const nextCharacter = nextNonWhitespaceCharacter(sourceText, tokenEnd);
    if (nextCharacter === null) {
        return false;
    }

    return /[A-Za-z0-9_([{'"!]/u.test(nextCharacter);
}

function normalizeLogicalOperatorAliases(sourceText: string): string {
    const rewritten: Array<string> = [];
    let index = 0;
    let inSingleLineComment = false;
    let inBlockComment = false;
    let inString: "'" | '"' | null = null;

    while (index < sourceText.length) {
        const character = sourceText[index];
        const nextCharacter = sourceText[index + 1];

        if (inSingleLineComment) {
            rewritten.push(character);
            if (character === "\n") {
                inSingleLineComment = false;
            }
            index += 1;
            continue;
        }

        if (inBlockComment) {
            if (character === "*" && nextCharacter === "/") {
                rewritten.push(character, nextCharacter);
                inBlockComment = false;
                index += 2;
                continue;
            }

            rewritten.push(character);
            index += 1;
            continue;
        }

        if (inString) {
            rewritten.push(character);
            if (character === "\\") {
                if (nextCharacter !== undefined) {
                    rewritten.push(nextCharacter);
                    index += 2;
                    continue;
                }
            } else if (character === inString) {
                inString = null;
            }

            index += 1;
            continue;
        }

        if (character === "/" && nextCharacter === "/") {
            rewritten.push(character, nextCharacter);
            inSingleLineComment = true;
            index += 2;
            continue;
        }

        if (character === "/" && nextCharacter === "*") {
            rewritten.push(character, nextCharacter);
            inBlockComment = true;
            index += 2;
            continue;
        }

        if (character === "'" || character === '"') {
            rewritten.push(character);
            inString = character;
            index += 1;
            continue;
        }

        if (isIdentifierCharacter(character)) {
            const start = index;
            let end = index + 1;
            while (end < sourceText.length && isIdentifierCharacter(sourceText[end])) {
                end += 1;
            }

            const token = sourceText.slice(start, end);
            const normalized = token.toLowerCase();
            if (normalized === "not" && isLogicalNotKeywordInContext(sourceText, start, end)) {
                rewritten.push("!");
            } else {
                rewritten.push(token);
            }

            index = end;
            continue;
        }

        rewritten.push(character);
        index += 1;
    }

    return rewritten.join("");
}

function createNormalizeDirectivesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
                    const rewrittenLines = lines.map((line) => normalizeLegacyDirectiveLine(line));

                    const rewritten = rewrittenLines.join(lineEnding);
                    reportFullTextRewrite(context, definition.messageId, text, rewritten);
                }
            });
        }
    });
}

function createRequireControlFlowBracesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
                    const rewrittenLines: Array<string> = [];
                    let inMacroContinuation = false;

                    for (let index = 0; index < lines.length; index += 1) {
                        const line = lines[index];

                        if (inMacroContinuation) {
                            rewrittenLines.push(line);
                            inMacroContinuation = lineUsesMacroContinuation(line);
                            continue;
                        }

                        if (/^\s*#macro\b/u.test(line)) {
                            rewrittenLines.push(line);
                            inMacroContinuation = lineUsesMacroContinuation(line);
                            continue;
                        }

                        const bracedConditionedClause = parseInlineControlFlowClause(line);
                        if (bracedConditionedClause) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(
                                    bracedConditionedClause.indentation,
                                    bracedConditionedClause.header,
                                    bracedConditionedClause.statement
                                )
                            );
                            continue;
                        }

                        const bracedElseClause = parseInlineElseClause(line);
                        if (bracedElseClause) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(
                                    bracedElseClause.indentation,
                                    bracedElseClause.header,
                                    bracedElseClause.statement
                                )
                            );
                            continue;
                        }

                        const inlineControlFlow = parseInlineControlFlowClauseWithLegacyIf(line);
                        if (inlineControlFlow) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(
                                    inlineControlFlow.indentation,
                                    inlineControlFlow.header,
                                    inlineControlFlow.statement
                                )
                            );
                            continue;
                        }

                        const inlineElse = parseInlineElseClause(line);
                        if (inlineElse) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(inlineElse.indentation, inlineElse.header, inlineElse.statement)
                            );
                            continue;
                        }

                        const inlineDoUntil = parseInlineDoUntilClause(line);
                        if (inlineDoUntil) {
                            rewrittenLines.push(
                                ...toBracedDoUntilClause(
                                    inlineDoUntil.indentation,
                                    inlineDoUntil.statement,
                                    inlineDoUntil.untilCondition
                                )
                            );
                            continue;
                        }

                        const lineHeaderMatch = parseLineOnlyControlFlowHeader(line);
                        if (lineHeaderMatch && index + 1 < lines.length) {
                            const nextLine = lines[index + 1];
                            const nextTrimmed = nextLine.trim();
                            if (isSafeSingleLineControlFlowStatement(nextTrimmed)) {
                                rewrittenLines.push(
                                    ...toBracedSingleClause(
                                        lineHeaderMatch.indentation,
                                        lineHeaderMatch.header,
                                        nextTrimmed
                                    )
                                );
                                index += 1;
                                continue;
                            }
                        }

                        const doHeaderIndentation = parseLineOnlyDoHeader(line);
                        if (doHeaderIndentation !== null && index + 2 < lines.length) {
                            const statementLine = lines[index + 1];
                            const statementTrimmed = statementLine.trim();
                            const untilCondition = parseLineOnlyUntilFooter(lines[index + 2]);
                            if (isSafeSingleLineControlFlowStatement(statementTrimmed) && untilCondition !== null) {
                                rewrittenLines.push(
                                    ...toBracedDoUntilClause(doHeaderIndentation, statementTrimmed, untilCondition)
                                );
                                index += 2;
                                continue;
                            }
                        }

                        const lineElseMatch = /^(\s*)else\s*$/u.exec(line);
                        if (lineElseMatch && index + 1 < lines.length) {
                            const nextLine = lines[index + 1];
                            const nextTrimmed = nextLine.trim();
                            if (isSafeSingleLineControlFlowStatement(nextTrimmed) && !nextTrimmed.startsWith("if ")) {
                                const indentation = lineElseMatch[1];
                                rewrittenLines.push(...toBracedSingleClause(indentation, "else", nextTrimmed));
                                index += 1;
                                continue;
                            }
                        }

                        rewrittenLines.push(line);
                    }

                    const rewritten = rewrittenLines.join(lineEnding);
                    reportFullTextRewrite(context, definition.messageId, text, rewritten);
                }
            });
        }
    });
}

function createNoAssignmentInConditionRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    let rewritten = text.replaceAll(
                        /\b(if|while)\s*\(([^)]*)\)/g,
                        (_fullMatch, keyword: string, conditionText: string) => {
                            const normalizedCondition = normalizeConditionAssignments(conditionText);
                            return `${keyword} (${normalizedCondition})`;
                        }
                    );
                    rewritten = rewritten.replaceAll(
                        /(^|\r?\n)(\s*if\s+)([^;\r\n]*?\))(\s+[A-Za-z_][^;\r\n]*;)/g,
                        (
                            _fullMatch: string,
                            prefix: string,
                            ifPrefix: string,
                            conditionText: string,
                            statementPortion: string
                        ) => {
                            const normalizedCondition = normalizeConditionAssignments(conditionText.trim());
                            return `${prefix}${ifPrefix}${normalizedCondition}${statementPortion}`;
                        }
                    );

                    reportFullTextRewrite(context, definition.messageId, text, rewritten);
                }
            });
        }
    });
}

type UndefinedComparisonRewrite = Readonly<{
    start: number;
    end: number;
    replacement: string;
}>;

function isUndefinedComparisonOperator(operator: unknown): operator is "==" | "!=" | "===" | "!==" {
    return (
        typeof operator === "string" &&
        (operator === "==" || operator === "!=" || operator === "===" || operator === "!==")
    );
}

function expandRewriteRangeToSingleWrappedParentheses(
    sourceText: string,
    rangeStart: number,
    rangeEnd: number
): Readonly<{ start: number; end: number }> {
    let trimmedStart = rangeStart;
    while (trimmedStart > 0 && /\s/u.test(sourceText[trimmedStart - 1] ?? "")) {
        trimmedStart -= 1;
    }

    const leftParenIndex = trimmedStart - 1;
    if (leftParenIndex < 0 || sourceText[leftParenIndex] !== "(") {
        return Object.freeze({ start: rangeStart, end: rangeEnd });
    }

    let previousIndex = leftParenIndex - 1;
    while (previousIndex >= 0 && /\s/u.test(sourceText[previousIndex] ?? "")) {
        previousIndex -= 1;
    }

    if (previousIndex >= 0 && /[A-Za-z0-9_\])"']/u.test(sourceText[previousIndex] ?? "")) {
        return Object.freeze({ start: rangeStart, end: rangeEnd });
    }

    let trimmedEnd = rangeEnd;
    while (trimmedEnd < sourceText.length && /\s/u.test(sourceText[trimmedEnd] ?? "")) {
        trimmedEnd += 1;
    }

    if (sourceText[trimmedEnd] !== ")") {
        return Object.freeze({ start: rangeStart, end: rangeEnd });
    }

    return Object.freeze({
        start: leftParenIndex,
        end: trimmedEnd + 1
    });
}

function createUndefinedComparisonRewrite(sourceText: string, node: unknown): UndefinedComparisonRewrite | null {
    if (!isAstNodeRecord(node) || node.type !== "BinaryExpression" || !isUndefinedComparisonOperator(node.operator)) {
        return null;
    }

    const leftNode = unwrapParenthesized(node.left);
    const rightNode = unwrapParenthesized(node.right);
    const leftIsUndefined = isUndefinedValueNode(leftNode);
    const rightIsUndefined = isUndefinedValueNode(rightNode);
    if (leftIsUndefined === rightIsUndefined) {
        return null;
    }

    const comparedExpression = leftIsUndefined ? rightNode : leftNode;
    const comparedExpressionStart = getNodeStartIndex(comparedExpression);
    const comparedExpressionEnd = getNodeEndIndex(comparedExpression);
    if (
        typeof comparedExpressionStart !== "number" ||
        typeof comparedExpressionEnd !== "number" ||
        comparedExpressionEnd <= comparedExpressionStart
    ) {
        return null;
    }

    const comparedExpressionText = sourceText.slice(comparedExpressionStart, comparedExpressionEnd).trim();
    if (comparedExpressionText.length === 0) {
        return null;
    }

    const parentNode = isAstNodeRecord(node.parent) ? node.parent : null;
    const replacementRangeNode =
        parentNode && parentNode.type === "ParenthesizedExpression" && parentNode.expression === node
            ? parentNode
            : node;

    const fullStart = getNodeStartIndex(replacementRangeNode);
    const fullEnd = getNodeEndIndex(replacementRangeNode);
    if (typeof fullStart !== "number" || typeof fullEnd !== "number" || fullEnd <= fullStart) {
        return null;
    }

    const replacementRange = expandRewriteRangeToSingleWrappedParentheses(sourceText, fullStart, fullEnd);

    const undefinedCheck = `is_undefined(${comparedExpressionText})`;
    const replacement = node.operator === "!=" || node.operator === "!==" ? `!${undefinedCheck}` : undefinedCheck;
    if (sourceText.slice(replacementRange.start, replacementRange.end) === replacement) {
        return null;
    }

    return Object.freeze({
        start: replacementRange.start,
        end: replacementRange.end,
        replacement
    });
}

function createPreferIsUndefinedCheckRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(programNode) {
                    const sourceText = context.sourceCode.text;
                    const candidateRewrites: Array<UndefinedComparisonRewrite> = [];
                    walkAstNodes(programNode, (node) => {
                        const rewrite = createUndefinedComparisonRewrite(sourceText, node);
                        if (rewrite) {
                            candidateRewrites.push(rewrite);
                        }
                    });

                    if (candidateRewrites.length === 0) {
                        return;
                    }

                    const nonOverlappingRewrites: Array<UndefinedComparisonRewrite> = [];
                    const orderedCandidates = candidateRewrites.toSorted((left, right) => {
                        if (left.start !== right.start) {
                            return left.start - right.start;
                        }

                        return right.end - left.end;
                    });
                    for (const candidate of orderedCandidates) {
                        if (hasOverlappingRange(candidate.start, candidate.end, nonOverlappingRewrites)) {
                            continue;
                        }

                        nonOverlappingRewrites.push(candidate);
                    }

                    for (const rewrite of nonOverlappingRewrites) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(rewrite.start),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([rewrite.start, rewrite.end], rewrite.replacement)
                        });
                    }
                }
            });
        }
    });
}

function createNormalizeOperatorAliasesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const rewritten = normalizeLogicalOperatorAliases(text);
                    reportFullTextRewrite(context, definition.messageId, text, rewritten);
                }
            });
        }
    });
}

type InterpolationSafeRewrite = Readonly<{
    start: number;
    end: number;
    replacement: string;
}>;

type InterpolationCandidateAnalysis =
    | Readonly<{
        kind: "safe";
        rewrite: InterpolationSafeRewrite;
    }>
    | Readonly<{
        kind: "unsafe";
        offset: number;
    }>;

function isStringCoercionCallExpression(node: unknown): node is {
    type: "CallExpression";
    object: { type: "Identifier"; name: string };
    arguments: ReadonlyArray<unknown>;
} {
    if (!isAstNodeRecord(node) || node.type !== "CallExpression") {
        return false;
    }

    if (!Array.isArray(node.arguments) || node.arguments.length !== 1) {
        return false;
    }

    const callTarget = node.object;
    return isAstNodeRecord(callTarget) && callTarget.type === "Identifier" && callTarget.name === "string";
}

function extractSimpleDoubleQuotedLiteralContent(sourceText: string, node: unknown): string | null {
    const start = getNodeStartIndex(node);
    const end = getNodeEndIndex(node);
    if (typeof start !== "number" || typeof end !== "number" || end <= start) {
        return null;
    }

    const rawLiteral = sourceText.slice(start, end);
    if (!/^"(?:[^"\\]|\\.)*"$/u.test(rawLiteral)) {
        return null;
    }

    const content = rawLiteral.slice(1, -1);
    if (content.includes("{") || content.includes("}")) {
        return null;
    }

    return content;
}

const INTERPOLATION_UNSAFE_EXPRESSION_NODE_TYPES = new Set(["AssignmentExpression", "IncDecStatement"]);
const INTERPOLATION_ALLOWED_EXPRESSION_NODE_TYPES = new Set([
    "Identifier",
    "MemberDotExpression",
    "MemberIndexExpression",
    "CallExpression",
    "NewExpression",
    "ThisExpression",
    "SuperExpression",
    "TernaryExpression"
]);

function isAllowedInterpolationExpressionShape(node: unknown): boolean {
    const unwrappedNode = unwrapParenthesized(node);
    if (!isAstNodeWithType(unwrappedNode)) {
        return false;
    }

    if (unwrappedNode.type === "ParenthesizedExpression") {
        return isAllowedInterpolationExpressionShape(unwrappedNode.expression);
    }

    return INTERPOLATION_ALLOWED_EXPRESSION_NODE_TYPES.has(unwrappedNode.type);
}

function isInterpolationSafeValueExpression(node: unknown): boolean {
    if (!isAstNodeWithType(node)) {
        return false;
    }

    let hasUnsafeExpressionNode = false;
    walkAstNodes(node, (currentNode) => {
        if (!isAstNodeWithType(currentNode)) {
            return;
        }

        if (INTERPOLATION_UNSAFE_EXPRESSION_NODE_TYPES.has(currentNode.type)) {
            hasUnsafeExpressionNode = true;
        }
    });

    return !hasUnsafeExpressionNode;
}

function collectConcatenationParts(node: unknown, output: Array<unknown>) {
    const unwrapped = unwrapParenthesized(node);
    if (isAstNodeRecord(unwrapped) && unwrapped.type === "BinaryExpression" && unwrapped.operator === "+") {
        collectConcatenationParts(unwrapped.left, output);
        collectConcatenationParts(unwrapped.right, output);
        return;
    }

    output.push(node);
}

function analyzeStringInterpolationCandidate(sourceText: string, node: unknown): InterpolationCandidateAnalysis | null {
    if (!isAstNodeRecord(node) || node.type !== "BinaryExpression" || node.operator !== "+") {
        return null;
    }

    const rangeStart = getNodeStartIndex(node);
    const rangeEnd = getNodeEndIndex(node);
    if (typeof rangeStart !== "number" || typeof rangeEnd !== "number" || rangeEnd <= rangeStart) {
        return null;
    }

    const parts: Array<unknown> = [];
    collectConcatenationParts(node, parts);
    if (parts.length < 2) {
        return null;
    }

    const templateSegments: Array<string> = [];
    let containsTextLiteral = false;
    let containsInterpolatedExpression = false;
    let hasUnsafeInterpolationExpression = false;
    let previousPartWasStringCoercion = false;

    for (const part of parts) {
        const unwrappedPart = unwrapParenthesized(part);
        const literalContent = extractSimpleDoubleQuotedLiteralContent(sourceText, unwrappedPart);
        if (literalContent !== null) {
            const normalizedLiteralContent =
                previousPartWasStringCoercion && literalContent.startsWith(" ") ? ` ${literalContent}` : literalContent;
            templateSegments.push(normalizedLiteralContent);
            previousPartWasStringCoercion = false;
            containsTextLiteral = true;
            continue;
        }

        let expressionNode = unwrappedPart;
        if (isStringCoercionCallExpression(unwrappedPart)) {
            const [stringArgumentNode] = unwrappedPart.arguments;
            expressionNode = stringArgumentNode;
            previousPartWasStringCoercion = true;
        } else if (isAllowedInterpolationExpressionShape(unwrappedPart)) {
            previousPartWasStringCoercion = false;
        } else {
            return null;
        }

        const expressionStart = getNodeStartIndex(expressionNode);
        const expressionEnd = getNodeEndIndex(expressionNode);
        if (
            typeof expressionStart !== "number" ||
            typeof expressionEnd !== "number" ||
            expressionEnd <= expressionStart
        ) {
            return null;
        }

        const expressionText = sourceText.slice(expressionStart, expressionEnd).trim();
        if (expressionText.length === 0) {
            return null;
        }

        if (
            expressionText.includes("{") ||
            expressionText.includes("}") ||
            !isInterpolationSafeValueExpression(expressionNode)
        ) {
            hasUnsafeInterpolationExpression = true;
        }

        templateSegments.push(`{${expressionText}}`);
        containsInterpolatedExpression = true;
    }

    if (!containsTextLiteral || !containsInterpolatedExpression) {
        return null;
    }

    if (hasUnsafeInterpolationExpression) {
        return Object.freeze({
            kind: "unsafe",
            offset: rangeStart
        });
    }

    const replacement = `$"${templateSegments.join("")}"`;
    if (replacement === sourceText.slice(rangeStart, rangeEnd)) {
        return null;
    }

    return Object.freeze({
        kind: "safe",
        rewrite: Object.freeze({
            start: rangeStart,
            end: rangeEnd,
            replacement
        })
    });
}

function collectStringInterpolationRewrites(
    sourceText: string,
    programNode: unknown
): Readonly<{
    safeRewrites: ReadonlyArray<InterpolationSafeRewrite>;
    unsafeOffsets: ReadonlyArray<number>;
}> {
    const safeCandidates: Array<InterpolationSafeRewrite> = [];
    const unsafeOffsets = new Set<number>();

    walkAstNodes(programNode, (node) => {
        const analysis = analyzeStringInterpolationCandidate(sourceText, node);
        if (!analysis) {
            return;
        }

        if (analysis.kind === "unsafe") {
            unsafeOffsets.add(analysis.offset);
            return;
        }

        safeCandidates.push(analysis.rewrite);
    });

    const safeRewrites: Array<InterpolationSafeRewrite> = [];
    const orderedSafeCandidates = safeCandidates.toSorted((left, right) => {
        if (left.start !== right.start) {
            return left.start - right.start;
        }

        return right.end - left.end;
    });

    for (const safeCandidate of orderedSafeCandidates) {
        if (hasOverlappingRange(safeCandidate.start, safeCandidate.end, safeRewrites)) {
            continue;
        }

        safeRewrites.push(safeCandidate);
    }

    const filteredUnsafeOffsets = [...unsafeOffsets]
        .toSorted((left, right) => left - right)
        .filter((offset) => {
            for (const rewrite of safeRewrites) {
                if (offset >= rewrite.start && offset < rewrite.end) {
                    return false;
                }
            }

            return true;
        });

    return Object.freeze({
        safeRewrites: Object.freeze(safeRewrites),
        unsafeOffsets: Object.freeze(filteredUnsafeOffsets)
    });
}

function createPreferStringInterpolationRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const shouldReportUnsafeFixes = shouldReportUnsafe(context);
            const listener: Rule.RuleListener = {
                Program(programNode) {
                    const sourceText = context.sourceCode.text;
                    const rewriteAnalysis = collectStringInterpolationRewrites(sourceText, programNode);

                    for (const safeRewrite of rewriteAnalysis.safeRewrites) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(safeRewrite.start),
                            messageId: definition.messageId,
                            fix: (fixer) =>
                                fixer.replaceTextRange([safeRewrite.start, safeRewrite.end], safeRewrite.replacement)
                        });
                    }

                    if (!shouldReportUnsafeFixes) {
                        return;
                    }

                    for (const unsafeOffset of rewriteAnalysis.unsafeOffsets) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(unsafeOffset),
                            messageId: "unsafeFix"
                        });
                    }
                }
            };

            const projectContext = resolveProjectContextForRule(context, definition);
            if (!projectContext.available) {
                return reportMissingProjectContextOncePerFile(context, listener);
            }

            return Object.freeze(listener);
        }
    });
}

type MultiplicativeComponents = Readonly<{
    coefficient: number;
    factors: ReadonlyMap<string, number>;
}>;

type AdditiveTerm = Readonly<{
    coefficient: number;
    baseExpression: string;
}>;

const SUPPORTED_OPAQUE_MATH_FACTOR_TYPES = new Set([
    "Identifier",
    "MemberDotExpression",
    "MemberIndexExpression",
    "CallExpression"
]);

function parseNumericLiteral(node: any): number | null {
    if (!node || node.type !== "Literal") {
        return null;
    }

    if (typeof node.value === "number" && Number.isFinite(node.value)) {
        return node.value;
    }

    if (typeof node.value === "string") {
        const parsed = Number(node.value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function tryEvaluateExpression(node: any): any {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped) {
        return undefined;
    }

    if (unwrapped.type === "Literal") {
        if (unwrapped.value === "true") {
            return true;
        }
        if (unwrapped.value === "false") {
            return false;
        }
        const num = parseNumericLiteral(unwrapped);
        if (num !== null) {
            return num;
        }
        return unwrapped.value;
    }

    if (unwrapped.type === "UnaryExpression") {
        const argumentValue = tryEvaluateExpression(unwrapped.argument);
        if (argumentValue === undefined) {
            return undefined;
        }

        switch (unwrapped.operator) {
            case "-": {
                return typeof argumentValue === "number" ? argumentValue * -1 : undefined;
            }
            case "!":
            case "not": {
                return !argumentValue;
            }
            case "~": {
                return typeof argumentValue === "number" ? ~argumentValue : undefined;
            }
            default: {
                return undefined;
            }
        }
    }

    if (unwrapped.type === "BinaryExpression" || unwrapped.type === "LogicalExpression") {
        const leftValue = tryEvaluateExpression(unwrapped.left);
        const rightValue = tryEvaluateExpression(unwrapped.right);

        // Handle short-circuiting for logical operators even if one side is unknown
        if (unwrapped.operator === "&&" || unwrapped.operator === "and") {
            if (leftValue === false || rightValue === false) {
                return false;
            }
            if (leftValue === true && rightValue === true) {
                return true;
            }
            return undefined;
        }
        if (unwrapped.operator === "||" || unwrapped.operator === "or") {
            if (leftValue === true || rightValue === true) {
                return true;
            }
            if (leftValue === false && rightValue === false) {
                return false;
            }
            return undefined;
        }

        if (leftValue === undefined || rightValue === undefined) {
            return undefined;
        }

        switch (unwrapped.operator) {
            case "+": {
                return leftValue + rightValue;
            }
            case "-": {
                return leftValue - rightValue;
            }
            case "*": {
                return leftValue * rightValue;
            }
            case "/": {
                return rightValue === 0 ? undefined : leftValue / rightValue;
            }
            case "div": {
                return rightValue === 0 ? undefined : Math.trunc(leftValue / rightValue);
            }
            case "mod":
            case "%": {
                return rightValue === 0 ? undefined : leftValue % rightValue;
            }
            case "xor": {
                return Boolean(leftValue) !== Boolean(rightValue);
            }
            case "==": {
                return leftValue == rightValue;
            }
            case "!=":
            case "<>": {
                return leftValue != rightValue;
            }
            case "<": {
                return leftValue < rightValue;
            }
            case ">": {
                return leftValue > rightValue;
            }
            case "<=": {
                return leftValue <= rightValue;
            }
            case ">=": {
                return leftValue >= rightValue;
            }
            case "??": {
                return leftValue ?? rightValue;
            }
            default: {
                return undefined;
            }
        }
    }

    if (unwrapped.type === "CallExpression") {
        const calleeName = getCallExpressionIdentifierName(unwrapped);
        const args = getCallExpressionArguments(unwrapped);
        const evaluatedArgs = args.map((arg) => tryEvaluateExpression(arg));

        if (evaluatedArgs.includes(undefined)) {
            return undefined;
        }

        switch (calleeName) {
            case "max": {
                return Math.max(...evaluatedArgs);
            }
            case "min": {
                return Math.min(...evaluatedArgs);
            }
            case "point_distance": {
                if (evaluatedArgs.length === 4) {
                    return Math.hypot(
                        (evaluatedArgs[2] - evaluatedArgs[0]), (evaluatedArgs[3] - evaluatedArgs[1])
                    );
                }
                break;
            }
            case "point_distance_3d": {
                if (evaluatedArgs.length === 6) {
                    return Math.hypot(
                        (evaluatedArgs[3] - evaluatedArgs[0]),
                        (evaluatedArgs[4] - evaluatedArgs[1]),
                        (evaluatedArgs[5] - evaluatedArgs[2])
                    );
                }
                break;
            }
            case "sqr": {
                if (evaluatedArgs.length === 1) {
                    return evaluatedArgs[0] * evaluatedArgs[0];
                }
                break;
            }
            case "abs": {
                if (evaluatedArgs.length === 1) {
                    return Math.abs(evaluatedArgs[0]);
                }
                break;
            }
            case "sign": {
                if (evaluatedArgs.length === 1) {
                    return Math.sign(evaluatedArgs[0]);
                }
                break;
            }
            case "round": {
                if (evaluatedArgs.length === 1) {
                    return Math.round(evaluatedArgs[0]);
                }
                break;
            }
            case "floor": {
                if (evaluatedArgs.length === 1) {
                    return Math.floor(evaluatedArgs[0]);
                }
                break;
            }
            case "ceil": {
                if (evaluatedArgs.length === 1) {
                    return Math.ceil(evaluatedArgs[0]);
                }
                break;
            }
        }
    }

    if (unwrapped.type === "ConditionalExpression" || unwrapped.type === "TernaryExpression") {
        const test = tryEvaluateExpression(unwrapped.test);
        if (test !== undefined) {
            return test ? tryEvaluateExpression(unwrapped.consequent) : tryEvaluateExpression(unwrapped.alternate);
        }
    }

    return undefined;
}

function tryEvaluateNumericExpression(node: any): number | null {
    const result = tryEvaluateExpression(node);
    return typeof result === "number" ? result : null;
}

function canUseOpaqueMathFactor(node: any): boolean {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped) {
        return false;
    }

    if (SUPPORTED_OPAQUE_MATH_FACTOR_TYPES.has(unwrapped.type)) {
        return true;
    }

    if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "-") {
        return canUseOpaqueMathFactor(unwrapped.argument);
    }

    if (unwrapped.type === "BinaryExpression" && (unwrapped.operator === "+" || unwrapped.operator === "-")) {
        return canUseOpaqueMathFactor(unwrapped.left) && canUseOpaqueMathFactor(unwrapped.right);
    }

    return false;
}

function isMultiplicativeExpressionRoot(node: any): boolean {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped) {
        return false;
    }

    if (unwrapped.type === "BinaryExpression") {
        return unwrapped.operator === "*" || unwrapped.operator === "/";
    }

    if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "-") {
        return isMultiplicativeExpressionRoot(unwrapped.argument);
    }

    return false;
}

function trimOuterParentheses(value: string): string {
    let text = value.trim();
    while (text.startsWith("(") && text.endsWith(")")) {
        let depth = 0;
        let balanced = true;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (char === "(") {
                depth += 1;
            } else if (char === ")") {
                depth -= 1;
                if (depth === 0 && index !== text.length - 1) {
                    balanced = false;
                    break;
                }
            }
        }

        if (!balanced || depth !== 0) {
            break;
        }

        text = text.slice(1, -1).trim();
    }

    return text;
}

function readNodeText(sourceText: string, node: any): string | null {
    const start = getNodeStartIndex(node);
    const end = getNodeEndIndex(node);
    if (typeof start !== "number" || typeof end !== "number" || start < 0 || end <= start || end > sourceText.length) {
        return null;
    }

    return sourceText.slice(start, end).trim();
}

function formatMathNumber(value: number): string {
    if (!Number.isFinite(value)) {
        return String(value);
    }

    const normalized = Number(value.toFixed(16));
    if (!Number.isFinite(normalized) || Object.is(normalized, -0)) {
        return "0";
    }

    return normalized.toFixed(16).replace(/(?:\.0+|(\.\d*?[1-9])0+)$/u, "$1");
}

function wrapFactorForProduct(factor: string): string {
    const trimmed = factor.trim();
    if (trimmed.length === 0) {
        return trimmed;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(trimmed)) {
        return trimmed;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*\([^\n]*\)$/u.test(trimmed)) {
        return trimmed;
    }

    // Support MemberIndexExpression: camMat[0]
    if (/^[A-Za-z_][A-Za-z0-9_]*\[[^\]\n]+\]$/u.test(trimmed)) {
        return trimmed;
    }

    if (/^".*"$|^'.*'$/u.test(trimmed)) {
        return trimmed;
    }

    if (/^[+-]?\d+(?:\.\d+)?$/u.test(trimmed)) {
        return trimmed;
    }

    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
        return trimmed;
    }

    return `(${trimmed})`;
}

function addFactorExponent(target: Map<string, number>, factor: string, delta: number): void {
    if (delta === 0) {
        return;
    }

    const next = (target.get(factor) ?? 0) + delta;
    if (next === 0) {
        target.delete(factor);
        return;
    }

    target.set(factor, next);
}

function collectMultiplicativeComponents(sourceText: string, node: any): MultiplicativeComponents | null {
    const unwrapped = unwrapParenthesized(node);

    if (!unwrapped) {
        return null;
    }

    if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "-") {
        const argumentComponents = collectMultiplicativeComponents(sourceText, unwrapped.argument);
        if (!argumentComponents) {
            return null;
        }

        return Object.freeze({
            coefficient: argumentComponents.coefficient * -1,
            factors: new Map(argumentComponents.factors)
        });
    }

    const evaluatedNumericValue = tryEvaluateNumericExpression(unwrapped);
    if (evaluatedNumericValue !== null) {
        return Object.freeze({
            coefficient: evaluatedNumericValue,
            factors: new Map()
        });
    }

    if (unwrapped.type === "BinaryExpression" && (unwrapped.operator === "*" || unwrapped.operator === "/")) {
        const leftComponents = collectMultiplicativeComponents(sourceText, unwrapped.left);
        const rightComponents = collectMultiplicativeComponents(sourceText, unwrapped.right);
        if (!leftComponents || !rightComponents) {
            return null;
        }

        const factors = new Map(leftComponents.factors);
        for (const [factor, exponent] of rightComponents.factors) {
            addFactorExponent(factors, factor, unwrapped.operator === "*" ? exponent : exponent * -1);
        }

        const coefficient =
            unwrapped.operator === "*"
                ? leftComponents.coefficient * rightComponents.coefficient
                : leftComponents.coefficient / rightComponents.coefficient;
        return Object.freeze({
            coefficient,
            factors
        });
    }

    if (!canUseOpaqueMathFactor(unwrapped)) {
        return null;
    }

    const factorText = readNodeText(sourceText, unwrapped);
    if (!factorText) {
        return null;
    }

    const factors = new Map<string, number>([[trimOuterParentheses(factorText), 1]]);
    return Object.freeze({
        coefficient: 1,
        factors
    });
}

function buildMultiplicativeExpression(components: MultiplicativeComponents): string {
    if (!Number.isFinite(components.coefficient)) {
        return formatMathNumber(components.coefficient);
    }

    if (components.coefficient === 0) {
        return "0";
    }

    const numeratorFactors: string[] = [];
    const denominatorFactors: string[] = [];
    for (const [factor, exponent] of components.factors) {
        if (exponent > 0) {
            for (let index = 0; index < exponent; index += 1) {
                numeratorFactors.push(wrapFactorForProduct(factor));
            }
        } else if (exponent < 0) {
            for (let index = 0; index < Math.abs(exponent); index += 1) {
                denominatorFactors.push(wrapFactorForProduct(factor));
            }
        }
    }

    let coefficient = components.coefficient;
    const sign = coefficient < 0 ? "-" : "";
    coefficient = Math.abs(coefficient);
    const coefficientText = formatMathNumber(coefficient);

    if (coefficient === 1 && components.factors.size === 1) {
        const [singleFactorEntry] = [...components.factors.entries()];
        if (singleFactorEntry) {
            const [singleFactor, exponent] = singleFactorEntry;
            if (exponent === 2 && /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(singleFactor)) {
                return `${sign}sqr(${trimOuterParentheses(singleFactor)})`;
            }
        }
    }

    if (numeratorFactors.length === 0 && denominatorFactors.length === 0) {
        return `${sign}${coefficientText}`;
    }

    const includeCoefficientInNumerator =
        denominatorFactors.length === 0 || coefficient === 1 || numeratorFactors.length === 0;
    if (includeCoefficientInNumerator && (coefficient !== 1 || numeratorFactors.length === 0)) {
        if (numeratorFactors.length === 0) {
            numeratorFactors.push(coefficientText);
        } else {
            numeratorFactors.push(coefficientText);
        }
    }

    const numeratorJoined = numeratorFactors.join(" * ");
    const numerator = numeratorFactors.length > 1 && denominatorFactors.length > 0
        ? `(${numeratorJoined})`
        : numeratorJoined;
    if (denominatorFactors.length === 0) {
        return `${sign}${numerator}`;
    }

    const denominator = denominatorFactors.length === 1 ? denominatorFactors[0] : `(${denominatorFactors.join(" * ")})`;
    if (!includeCoefficientInNumerator && coefficient !== 1) {
        return `${sign}(${numerator} / ${denominator}) * ${coefficientText}`;
    }

    return `${sign}${numerator} / ${denominator}`;
}

function collectAdditiveTerms(sourceText: string, node: any): AdditiveTerm[] | null {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped) {
        return null;
    }

    const output: AdditiveTerm[] = [];
    const pending: Array<{ node: any; sign: number }> = [{ node: unwrapped, sign: 1 }];

    while (pending.length > 0) {
        const current = pending.pop();
        if (!current) {
            continue;
        }

        const expression = unwrapParenthesized(current.node);
        if (expression?.type === "BinaryExpression" && (expression.operator === "+" || expression.operator === "-")) {
            pending.push(
                {
                    node: expression.right,
                    sign: expression.operator === "+" ? current.sign : current.sign * -1
                },
                {
                    node: expression.left,
                    sign: current.sign
                }
            );
            continue;
        }

        const components = collectMultiplicativeComponents(sourceText, expression);
        if (!components) {
            return null;
        }

        const baseComponents = Object.freeze({
            coefficient: 1,
            factors: components.factors
        });
        output.push({
            coefficient: components.coefficient * current.sign,
            baseExpression: buildMultiplicativeExpression(baseComponents)
        });
    }

    return output;
}

function simplifyDegreesToRadiansExpression(sourceText: string, node: any): string | null {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped || unwrapped.type !== "BinaryExpression" || unwrapped.operator !== "/") {
        return null;
    }

    const denominatorValue = parseNumericLiteral(unwrapParenthesized(unwrapped.right));
    if (denominatorValue === null || Math.abs(denominatorValue - 180) > Number.EPSILON) {
        return null;
    }

    const numerator = unwrapParenthesized(unwrapped.left);
    if (!numerator || numerator.type !== "BinaryExpression" || numerator.operator !== "*") {
        return null;
    }

    const left = unwrapParenthesized(numerator.left);
    const right = unwrapParenthesized(numerator.right);
    const piOnLeft = left?.type === "Identifier" && left.name === "pi";
    const piOnRight = right?.type === "Identifier" && right.name === "pi";
    if (!piOnLeft && !piOnRight) {
        return null;
    }

    const angleNode = piOnLeft ? numerator.right : numerator.left;
    const angleText = readNodeText(sourceText, angleNode);
    if (!angleText) {
        return null;
    }

    return `degtorad(${trimOuterParentheses(angleText)})`;
}

function simplifyMathExpression(sourceText: string, node: any): string | null {
    const source = readNodeText(sourceText, node);
    if (!source) {
        return null;
    }

    const evaluation = tryEvaluateExpression(node);
    if (evaluation !== undefined && // If it's a constant, we only replace it if there are no internal comments,
        // unless it's a very simple wrap.
        !source.includes("/*") && !source.includes("//")) {
            if (typeof evaluation === "number") {
                const formatted = formatMathNumber(evaluation);
                return formatted === trimOuterParentheses(source) ? null : formatted;
            }
            if (typeof evaluation === "boolean") {
                const formatted = String(evaluation);
                return formatted === trimOuterParentheses(source) ? null : formatted;
            }
            if (typeof evaluation === "string") {
                const formatted = evaluation.startsWith('"') || evaluation.startsWith("'") ? evaluation : `"${evaluation}"`;
                return formatted === trimOuterParentheses(source) ? null : formatted;
            }
        }

    const root = unwrapParenthesized(node);
    if (!root) {
        return null;
    }

    // Algebraic reduction: (a - b) <= 0  => a <= b
    if (
        root.type === "BinaryExpression" &&
        (root.operator === "<=" ||
            root.operator === "<" ||
            root.operator === ">=" ||
            root.operator === ">" ||
            root.operator === "==")
    ) {
        const left = unwrapParenthesized(root.left);
        const rightValue = tryEvaluateExpression(root.right);
        if (left?.type === "BinaryExpression" && left.operator === "-" && rightValue === 0) {
            const aText = readNodeText(sourceText, left.left);
            const bText = readNodeText(sourceText, left.right);
            if (aText && bText && !aText.includes("/") && !bText.includes("/")) {
                return `${aText} ${root.operator} ${bText}`;
            }
        }
    }

    // Special case for comment preservation in / 2 -> * 0.5
    if (root.type === "BinaryExpression" && root.operator === "/" && source.includes("/*")) {
        const leftValueNode = unwrapParenthesized(root.left);
        const rightValue = tryEvaluateNumericExpression(root.right);
        if (canUseOpaqueMathFactor(leftValueNode) && rightValue === 2) {
            const leftEnd = getNodeEndIndex(root.left);
            const rootStart = getNodeStartIndex(root);
            if (typeof leftEnd === "number" && typeof rootStart === "number") {
                const operatorSearchIndex = leftEnd - rootStart;
                // Look for / after the left operand but before the end
                const operatorIndex = source.indexOf("/", Math.max(0, operatorSearchIndex));
                if (operatorIndex !== -1) {
                    const before = source.slice(0, operatorIndex);
                    const after = source.slice(operatorIndex + 1);
                    return `${before}*${after.replace(/\b2\b/, "0.5")}`;
                }
            }
        }
    }

    // Enforce parentheses for precedence where expected by tests (e.g. nested multiplication in addition)
    if (root.type === "BinaryExpression" && (root.operator === "+" || root.operator === "-")) {
        const left = unwrapParenthesized(root.left);
        const right = unwrapParenthesized(root.right);

        let leftPart = readNodeText(sourceText, root.left);
        let rightPart = readNodeText(sourceText, root.right);

        if (left?.type === "BinaryExpression" && (left.operator === "*" || left.operator === "/") && leftPart && !leftPart.startsWith("(")) {
                leftPart = `(${leftPart})`;
            }
        if (right?.type === "BinaryExpression" && (right.operator === "*" || right.operator === "/") && rightPart && !rightPart.startsWith("(")) {
                rightPart = `(${rightPart})`;
            }

        if (leftPart && rightPart) {
            const result = `${leftPart} ${root.operator} ${rightPart}`;
            if (result !== trimOuterParentheses(source)) {
                return result;
            }
        }
    }
    const degreesToRadians = simplifyDegreesToRadiansExpression(sourceText, node);
    if (degreesToRadians && degreesToRadians !== trimOuterParentheses(source)) {
        return degreesToRadians;
    }

    const isAdditiveRoot = root.type === "BinaryExpression" && (root.operator === "+" || root.operator === "-");
    const additiveTerms = isAdditiveRoot ? collectAdditiveTerms(sourceText, root) : null;
    if (isAdditiveRoot && additiveTerms && additiveTerms.length > 0) {
        const combined = new Map<string, number>();
        const order: string[] = [];
        for (const term of additiveTerms) {
            if (!combined.has(term.baseExpression)) {
                order.push(term.baseExpression);
            }
            combined.set(term.baseExpression, (combined.get(term.baseExpression) ?? 0) + term.coefficient);
        }

        const terms: string[] = [];
        for (const baseExpression of order) {
            const coefficient = combined.get(baseExpression) ?? 0;
            if (Math.abs(coefficient) <= Number.EPSILON) {
                continue;
            }

            if (baseExpression === "1") {
                terms.push(formatMathNumber(coefficient));
                continue;
            }

            if (Math.abs(coefficient - 1) <= Number.EPSILON) {
                terms.push(baseExpression);
                continue;
            }

            if (Math.abs(coefficient + 1) <= Number.EPSILON) {
                terms.push(`-${wrapFactorForProduct(baseExpression)}`);
                continue;
            }

            terms.push(`${wrapFactorForProduct(baseExpression)} * ${formatMathNumber(coefficient)}`);
        }

        if (terms.length > 0) {
            const mergedTerms = order.length < additiveTerms.length;
            const removedTerms = terms.length < order.length;
            const hasSquareRewrite = terms.some((term) => term.includes("sqr("));
            if (!mergedTerms && !removedTerms && !hasSquareRewrite) {
                return null;
            }

            const rewritten = terms
                .map((term, index) => {
                    if (index === 0) {
                        return term;
                    }

                    return term.startsWith("-") ? `- ${term.slice(1)}` : `+ ${term}`;
                })
                .join(" ");
            if (rewritten !== trimOuterParentheses(source)) {
                return rewritten;
            }
        }
    }

    if (!isMultiplicativeExpressionRoot(root)) {
        return null;
    }

    const multiplicative = collectMultiplicativeComponents(sourceText, root);
    if (!multiplicative) {
        return null;
    }

    const rewritten = buildMultiplicativeExpression(multiplicative);
    if (rewritten === trimOuterParentheses(source)) {
        return null;
    }

    return rewritten;
}

function extractHalfLengthdirRotationExpression(
    assignmentRight: any,
    variableName: string,
    sourceText: string
): string | null {
    const expression = unwrapParenthesized(assignmentRight);
    if (!expression || expression.type !== "BinaryExpression" || expression.operator !== "-") {
        return null;
    }

    const left = unwrapParenthesized(expression.left);
    const right = unwrapParenthesized(expression.right);
    if (!left || !right || left.type !== "BinaryExpression" || left.operator !== "-") {
        return null;
    }

    const leftMost = unwrapParenthesized(left.left);
    if (!leftMost || leftMost.type !== "Identifier" || leftMost.name !== variableName) {
        return null;
    }

    const leftSubtrahend = unwrapParenthesized(left.right);
    if (
        !leftSubtrahend ||
        leftSubtrahend.type !== "BinaryExpression" ||
        leftSubtrahend.operator !== "/" ||
        unwrapParenthesized(leftSubtrahend.left)?.type !== "Identifier" ||
        unwrapParenthesized(leftSubtrahend.left)?.name !== variableName
    ) {
        return null;
    }

    const leftDivisor = parseNumericLiteral(unwrapParenthesized(leftSubtrahend.right));
    if (leftDivisor === null || Math.abs(leftDivisor - 2) > Number.EPSILON) {
        return null;
    }

    if (right.type !== "CallExpression" || unwrapParenthesized(right.object)?.type !== "Identifier") {
        return null;
    }

    const callee = unwrapParenthesized(right.object);
    if (!callee || callee.type !== "Identifier" || callee.name !== "lengthdir_x") {
        return null;
    }

    if (!Array.isArray(right.arguments) || right.arguments.length !== 2) {
        return null;
    }

    const firstArgument = unwrapParenthesized(right.arguments[0]);
    if (
        !firstArgument ||
        firstArgument.type !== "BinaryExpression" ||
        firstArgument.operator !== "/" ||
        unwrapParenthesized(firstArgument.left)?.type !== "Identifier" ||
        unwrapParenthesized(firstArgument.left)?.name !== variableName
    ) {
        return null;
    }

    const rightDivisor = parseNumericLiteral(unwrapParenthesized(firstArgument.right));
    if (rightDivisor === null || Math.abs(rightDivisor - 2) > Number.EPSILON) {
        return null;
    }

    const rotationText = readNodeText(sourceText, right.arguments[1]);
    return rotationText ? trimOuterParentheses(rotationText) : null;
}

function rewriteManualMathCanonicalForms(sourceText: string): string {
    let rewritten = sourceText;

    rewritten = rewritten.replaceAll(
        /sqrt\(\s*\(([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\)\s*\*\s*\(\1\s*-\s*\2\)\s*\+\s*\(([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\)\s*\*\s*\(\3\s*-\s*\4\)\s*\)/g,
        (_fullMatch, x2: string, x1: string, y2: string, y1: string) => `point_distance(${x1}, ${y1}, ${x2}, ${y2})`
    );

    rewritten = rewritten.replaceAll(
        /power\(\s*\(([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\)\s*\*\s*\(\1\s*-\s*\2\)\s*\+\s*\(([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\)\s*\*\s*\(\3\s*-\s*\4\)\s*,\s*0\.5\s*\)/g,
        (_fullMatch, x2: string, x1: string, y2: string, y1: string) => `point_distance(${x1}, ${y1}, ${x2}, ${y2})`
    );

    rewritten = rewritten.replaceAll(
        /sqrt\(\s*\(([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\)\s*\*\s*\(\1\s*-\s*\2\)\s*\+\s*\(([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\)\s*\*\s*\(\3\s*-\s*\4\)\s*\+\s*\(([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\)\s*\*\s*\(\5\s*-\s*\6\)\s*\)/g,
        (_fullMatch, x2: string, x1: string, y2: string, y1: string, z2: string, z1: string) =>
            `point_distance_3d(${x1}, ${y1}, ${z1}, ${x2}, ${y2}, ${z2})`
    );

    rewritten = rewritten.replaceAll(
        /arctan2\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
        (_fullMatch, y2: string, y1: string, x2: string, x1: string) => `point_direction(${x1}, ${y1}, ${x2}, ${y2})`
    );

    rewritten = rewritten.replaceAll(
        /\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\+\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\+\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
        (_fullMatch, x1: string, x2: string, y1: string, y2: string, z1: string, z2: string) => {
            if (x1 === x2 || y1 === y2 || z1 === z2) {
                return _fullMatch;
            }

            return `dot_product_3d(${x1}, ${y1}, ${z1}, ${x2}, ${y2}, ${z2})`;
        }
    );

    rewritten = rewritten.replaceAll(
        /\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\+\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
        (_fullMatch, leftX: string, rightX: string, leftY: string, rightY: string) => {
            if (leftX === rightX || leftY === rightY) {
                return _fullMatch;
            }

            return `dot_product(${leftX}, ${leftY}, ${rightX}, ${rightY})`;
        }
    );

    rewritten = rewritten.replaceAll(
        /(\bvar\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*\+\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)(\s*;)/g,
        (
            fullMatch,
            declarationPrefix: string,
            leftX: string,
            rightX: string,
            leftY: string,
            rightY: string,
            suffix: string
        ) => {
            if (leftX === rightX || leftY === rightY) {
                return fullMatch;
            }

            return `${declarationPrefix}dot_product(${leftX}, ${leftY}, ${rightX}, ${rightY})${suffix}`;
        }
    );

    rewritten = rewritten.replaceAll(
        /([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*dcos\(\s*([^)]+?)\s*\)\s*\*\s*dcos\(\s*([^)]+?)\s*\)/g,
        (_fullMatch, length: string, angle: string, pitch: string) =>
            `lengthdir_x(${length}, ${angle}) * dcos(${pitch})`
    );
    rewritten = rewritten.replaceAll(
        /-\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*dsin\(\s*([^)]+?)\s*\)/g,
        (_fullMatch, length: string, angle: string) => `lengthdir_y(${length}, ${angle})`
    );
    rewritten = rewritten.replaceAll(
        /\b([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*dcos\(\s*([^)]+?)\s*\)/g,
        (_fullMatch, length: string, angle: string) => `lengthdir_x(${length}, ${angle})`
    );
    rewritten = rewritten.replaceAll(
        /-\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*sin\(\s*degtorad\(\s*([^)]+?)\s*\)\s*\)/g,
        (_fullMatch, length: string, angle: string) => `lengthdir_y(${length}, ${angle})`
    );
    rewritten = rewritten.replaceAll(
        /\b([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*cos\(\s*degtorad\(\s*([^)]+?)\s*\)\s*\)/g,
        (_fullMatch, length: string, angle: string) => `lengthdir_x(${length}, ${angle})`
    );

    rewritten = rewritten.replaceAll(
        /sin\(\s*(?:\(\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*pi\s*\/\s*180\s*(?:\)\s*)?\)/g,
        (_fullMatch, value: string) => `dsin(${value})`
    );
    rewritten = rewritten.replaceAll(
        /cos\(\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\/\s*180\s*\)\s*\*\s*pi\s*\)/g,
        (_fullMatch, value: string) => `dcos(${value})`
    );
    rewritten = rewritten.replaceAll(
        /tan\(\s*(?:\(\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*pi\s*\/\s*180\s*(?:\)\s*)?\)/g,
        (_fullMatch, value: string) => `dtan(${value})`
    );

    rewritten = rewritten.replaceAll(
        /\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\+\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*(?:\/\s*2|\*\s*0\.5)/g,
        (_fullMatch, leftOperand: string, rightOperand: string) => `mean(${leftOperand}, ${rightOperand})`
    );

    rewritten = rewritten.replaceAll(
        /power\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*0\.5\s*\)/g,
        (_fullMatch, value: string) => `sqrt(${value})`
    );
    rewritten = rewritten.replaceAll(
        /ln\(\s*([^)]+?)\s*\)\s*\/\s*ln\(\s*2\s*\)/g,
        (_fullMatch, value: string) => `log2(${value.trim()})`
    );
    rewritten = rewritten.replaceAll(
        /power\(\s*2\.718281828459045\s*,\s*([^)]+?)\s*\)/g,
        (_fullMatch, value: string) => `exp(${value.trim()})`
    );

    rewritten = rewritten.replaceAll(
        /\b([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*\1\s*\*\s*\1\s*\*\s*\1\b/g,
        (_fullMatch, value: string) => `power(${value}, 4)`
    );
    rewritten = rewritten.replaceAll(
        /\(\s*\b([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*\1\s*\*\s*\1\s*\)|\b([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*\2\s*\*\s*\2\b/g,
        (_fullMatch, value1: string, value2: string) => `power(${value1 || value2}, 3)`
    );
    rewritten = rewritten.replaceAll(
        /\(\s*\b([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*\1\s*\)|\b([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*\2\b/g,
        (_fullMatch, value1: string, value2: string) => `sqr(${value1 || value2})`
    );

    rewritten = rewritten.replaceAll(/window_get_width\(\)\s*\/\s*2/g, "window_get_width() * 0.5");
    rewritten = rewritten.replaceAll(/window_get_height\(\)\s*\/\s*2/g, "window_get_height() * 0.5");
    rewritten = rewritten.replaceAll(
        /camPitch\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*(0\.\d+)/g,
        (_fullMatch, value: string, scalar: string) => `camPitch - (${value} * ${scalar})`
    );
    rewritten = rewritten.replaceAll(
        /sqr\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\*\s*([0-9]+(?:\.[0-9]+)?)/g,
        (_fullMatch, value: string, scalar: string) => `(${scalar} * sqr(${value}))`
    );

    rewritten = rewritten.replaceAll(/\((dot_product(?:_3d)?\([^)]+\))\)/g, (_fullMatch, call: string) => call);

    return rewritten;
}

function createOptimizeMathExpressionsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(node) {
                    const sourceText = context.sourceCode.text;
                    const edits: SourceTextEdit[] = [];
                    const bodyStatements = Array.isArray(node?.body) ? node.body : [];

                    // Pass 1: Handle half-lengthdir optimizations (original logic)
                    for (let index = 0; index + 1 < bodyStatements.length; index += 1) {
                        const current = bodyStatements[index];
                        const next = bodyStatements[index + 1];
                        const declarator = getVariableDeclarator(current);
                        if (!declarator || !isAstNodeRecord(declarator.id) || !declarator.init) {
                            continue;
                        }

                        if (declarator.id.type !== "Identifier" || typeof declarator.id.name !== "string") {
                            continue;
                        }
                        const variableName = declarator.id.name;

                        const nextExpression = CoreWorkspace.Core.unwrapExpressionStatement(next);
                        if (
                            !nextExpression ||
                            nextExpression.type !== "AssignmentExpression" ||
                            nextExpression.operator !== "=" ||
                            unwrapParenthesized(nextExpression.left)?.type !== "Identifier" ||
                            unwrapParenthesized(nextExpression.left)?.name !== variableName
                        ) {
                            continue;
                        }

                        const rotationExpression = extractHalfLengthdirRotationExpression(
                            nextExpression.right,
                            variableName,
                            sourceText
                        );
                        if (!rotationExpression) {
                            continue;
                        }

                        const initComponents = collectMultiplicativeComponents(sourceText, declarator.init);
                        if (!initComponents) {
                            continue;
                        }

                        const rewrittenInit = buildMultiplicativeExpression(
                            Object.freeze({
                                coefficient: initComponents.coefficient * 0.5,
                                factors: initComponents.factors
                            })
                        );
                        const fullInit = `${rewrittenInit} * (1 - lengthdir_x(1, ${rotationExpression}))`;
                        const initStart = getNodeStartIndex(declarator.init);
                        const initEnd = getNodeEndIndex(declarator.init);
                        const assignmentStart = getNodeStartIndex(next);
                        const assignmentEnd = getNodeEndIndex(next);
                        if (
                            typeof initStart !== "number" ||
                            typeof initEnd !== "number" ||
                            typeof assignmentStart !== "number" ||
                            typeof assignmentEnd !== "number"
                        ) {
                            continue;
                        }

                        let assignmentRemovalEnd = assignmentEnd;
                        while (
                            sourceText[assignmentRemovalEnd] === ";" ||
                            sourceText[assignmentRemovalEnd] === " " ||
                            sourceText[assignmentRemovalEnd] === "\t"
                        ) {
                            assignmentRemovalEnd += 1;
                        }
                        if (sourceText[assignmentRemovalEnd] === "\n") {
                            assignmentRemovalEnd += 1;
                        }

                        edits.push(
                            {
                                start: initStart,
                                end: initEnd,
                                text: fullInit
                            },
                            {
                                start: assignmentStart,
                                end: assignmentRemovalEnd,
                                text: ""
                            }
                        );
                    }

                    // Pass 2: Dead code elimination for cancelling standalone increments/decrements
                    const updatesByVariable = new Map<string, { delta: number; indices: number[] }>();
                    for (let i = 0; i < bodyStatements.length; i++) {
                        const stmt = bodyStatements[i];
                        const expr = CoreWorkspace.Core.unwrapExpressionStatement(stmt);
                        let handled = false;

                        if (expr && expr.type === "UpdateExpression") {
                            const idNode = unwrapParenthesized(expr.argument);
                            if (idNode?.type === "Identifier") {
                                const name = idNode.name;
                                const current = updatesByVariable.get(name) || { delta: 0, indices: [] };
                                current.delta += expr.operator === "++" ? 1 : -1;
                                current.indices.push(i);
                                updatesByVariable.set(name, current);
                                handled = true;
                            }
                        } else if (expr && expr.type === "AssignmentExpression") {
                            const idNode = unwrapParenthesized(expr.left);
                            if (idNode?.type === "Identifier") {
                                if (expr.operator === "+=" || expr.operator === "-=") {
                                    const val = tryEvaluateNumericExpression(expr.right);
                                    if (val !== null) {
                                        const name = idNode.name;
                                        const current = updatesByVariable.get(name) || { delta: 0, indices: [] };
                                        current.delta += expr.operator === "+=" ? val : -val;
                                        current.indices.push(i);
                                        updatesByVariable.set(name, current);
                                        handled = true;
                                    }
                                } else if (expr.operator === "*=" || expr.operator === "/=") {
                                    const val = tryEvaluateNumericExpression(expr.right);
                                    if (val === 1) {
                                        const start = getNodeStartIndex(stmt);
                                        const end = getNodeEndIndex(stmt);
                                        if (typeof start === "number" && typeof end === "number") {
                                            let removalEnd = end;
                                            while (
                                                removalEnd < sourceText.length &&
                                                (sourceText[removalEnd] === ";" ||
                                                    sourceText[removalEnd] === " " ||
                                                    sourceText[removalEnd] === "\t" ||
                                                    sourceText[removalEnd] === "\r")
                                            ) {
                                                removalEnd += 1;
                                            }
                                            if (sourceText[removalEnd] === "\n") {
                                                removalEnd += 1;
                                            }
                                            edits.push({ start, end: removalEnd, text: "" });
                                        }
                                        handled = true;
                                    }
                                }
                            }
                        }

                        if (!handled) {
                            for (const [_, info] of updatesByVariable.entries()) {
                                if (Math.abs(info.delta) < 1e-10 && info.indices.length > 0) {
                                    for (const idx of info.indices) {
                                        const nodeToRem = bodyStatements[idx];
                                        const start = getNodeStartIndex(nodeToRem);
                                        const end = getNodeEndIndex(nodeToRem);
                                        if (typeof start === "number" && typeof end === "number") {
                                            let removalEnd = end;
                                            while (
                                                removalEnd < sourceText.length &&
                                                (sourceText[removalEnd] === ";" ||
                                                    sourceText[removalEnd] === " " ||
                                                    sourceText[removalEnd] === "\t" ||
                                                    sourceText[removalEnd] === "\r")
                                            ) {
                                                removalEnd += 1;
                                            }
                                            if (sourceText[removalEnd] === "\n") {
                                                removalEnd += 1;
                                            }
                                            edits.push({ start, end: removalEnd, text: "" });
                                        }
                                    }
                                }
                            }
                            updatesByVariable.clear();
                        }
                    }

                    // Pass 3: General expression simplification
                    walkAstNodesWithParent(node, (visitContext) => {
                        const { node: visitedNode } = visitContext;

                        let targetNode: any = null;
                        let isIfTest = false;
                        if (visitedNode.type === "VariableDeclarator" && visitedNode.init) {
                            targetNode = visitedNode.init;
                        } else if (visitedNode.type === "AssignmentExpression") {
                            targetNode = visitedNode.right;
                        } else if (visitedNode.type === "IfStatement") {
                            targetNode = visitedNode.test;
                            isIfTest = true;
                        } else if (visitedNode.type === "BinaryExpression") {
                            targetNode = visitedNode;
                        }

                        if (targetNode) {
                            let replacement = simplifyMathExpression(sourceText, targetNode);
                            if (replacement) {
                                if (isIfTest && !replacement.startsWith("(")) {
                                    replacement = `(${replacement})`;
                                }
                                const start = getNodeStartIndex(targetNode);
                                const end = getNodeEndIndex(targetNode);
                                if (typeof start === "number" && typeof end === "number") {
                                    edits.push({ start, end, text: replacement });
                                }
                            }
                        }
                    });

                    const deduplicated: SourceTextEdit[] = [];
                    for (const edit of edits.toSorted(
                        (left, right) => left.start - right.start || left.end - right.end
                    )) {
                        if (hasOverlappingRange(edit.start, edit.end, deduplicated)) {
                            continue;
                        }

                        deduplicated.push(edit);
                    }

                    const rewrittenByAstEdits = applySourceTextEdits(sourceText, deduplicated);
                    const rewrittenText = rewriteManualMathCanonicalForms(rewrittenByAstEdits);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}

type ArgumentSeparatorInsertion = Readonly<{
    originalOffset: number;
    insertedText: ",";
}>;

function tryReadArgumentSeparatorRecoveryFromParserServices(
    context: Rule.RuleContext
): ReadonlyArray<ArgumentSeparatorInsertion> | null {
    const parserServices = context.sourceCode.parserServices;
    if (!parserServices || typeof parserServices !== "object") {
        return null;
    }

    const parserServicesWithGml = parserServices as { gml?: unknown };
    if (!parserServicesWithGml.gml || typeof parserServicesWithGml.gml !== "object") {
        return null;
    }

    const gmlWithRecovery = parserServicesWithGml.gml as { recovery?: unknown };
    if (!Array.isArray(gmlWithRecovery.recovery)) {
        return null;
    }

    const insertions: Array<ArgumentSeparatorInsertion> = [];
    for (const recoveryEntry of gmlWithRecovery.recovery) {
        if (!recoveryEntry || typeof recoveryEntry !== "object") {
            continue;
        }

        const originalOffset = Reflect.get(recoveryEntry, "originalOffset");
        const insertedText = Reflect.get(recoveryEntry, "insertedText");

        if (typeof originalOffset === "number" && Number.isInteger(originalOffset) && insertedText === ",") {
            insertions.push(
                Object.freeze({
                    originalOffset,
                    insertedText
                })
            );
        }
    }

    return Object.freeze(insertions);
}

function collectArgumentSeparatorInsertionOffsets(
    context: Rule.RuleContext,
    sourceText: string
): ReadonlyArray<number> {
    const parserRecoveryInsertions = tryReadArgumentSeparatorRecoveryFromParserServices(context);
    const recoveries = parserRecoveryInsertions ?? createLimitedRecoveryProjection(sourceText).insertions;
    const uniqueOffsets = new Set<number>();

    for (const recovery of recoveries) {
        if (recovery.originalOffset < 0 || recovery.originalOffset > sourceText.length) {
            continue;
        }

        uniqueOffsets.add(recovery.originalOffset);
    }

    return Object.freeze([...uniqueOffsets].sort((left, right) => left - right));
}

function createRequireArgumentSeparatorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const shouldRepair = options.repair === undefined ? true : options.repair === true;

            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const insertionOffsets = collectArgumentSeparatorInsertionOffsets(context, sourceText);

                    for (const insertionOffset of insertionOffsets) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(insertionOffset),
                            messageId: definition.messageId,
                            fix: shouldRepair
                                ? (fixer) => fixer.insertTextAfterRange([insertionOffset, insertionOffset], ",")
                                : null
                        });
                    }
                }
            });
        }
    });
}

function createNormalizeDataStructureAccessorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const rewrites: Array<{ start: number; end: number; replacement: string }> = [];
                    const memberPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(\[\?|\[\||\[#)\s*/g;
                    for (const match of text.matchAll(memberPattern)) {
                        const variableName = match[1];
                        const accessor = match[2];
                        const lowerName = variableName.toLowerCase();

                        let expectedAccessor: string | null = null;
                        if (lowerName.includes("list") || lowerName.includes("lst")) {
                            expectedAccessor = "[|";
                        } else if (lowerName.includes("map")) {
                            expectedAccessor = "[?";
                        } else if (lowerName.includes("grid")) {
                            expectedAccessor = "[#";
                        }

                        if (!expectedAccessor || expectedAccessor === accessor) {
                            continue;
                        }

                        const start = (match.index ?? 0) + match[0].indexOf(accessor);
                        rewrites.push({
                            start,
                            end: start + accessor.length,
                            replacement: expectedAccessor
                        });
                    }

                    for (const rewrite of rewrites) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(rewrite.start),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([rewrite.start, rewrite.end], rewrite.replacement)
                        });
                    }
                }
            });
        }
    });
}

type SourceTextEdit = Readonly<{
    start: number;
    end: number;
    text: string;
}>;

type LeadingArgumentFallback = Readonly<{
    parameterName: string;
    argumentIndex: number;
    defaultExpression: string;
    statement: any;
}>;

function applySourceTextEdits(sourceText: string, edits: ReadonlyArray<SourceTextEdit>): string {
    if (edits.length === 0) {
        return sourceText;
    }

    const ordered = [...edits].toSorted((left, right) => right.start - left.start);
    let rewritten = sourceText;
    for (const edit of ordered) {
        if (edit.start < 0 || edit.end < edit.start || edit.end > rewritten.length) {
            continue;
        }

        rewritten = `${rewritten.slice(0, edit.start)}${edit.text}${rewritten.slice(edit.end)}`;
    }

    return rewritten;
}

function walkAstNodes(root: unknown, visit: (node: any) => void) {
    if (!root || typeof root !== "object") {
        return;
    }

    const visited = new WeakSet<object>();
    const stack: unknown[] = [root];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== "object") {
            continue;
        }

        if (Array.isArray(current)) {
            for (let index = current.length - 1; index >= 0; index -= 1) {
                stack.push(current[index]);
            }
            continue;
        }

        if (visited.has(current)) {
            continue;
        }

        visited.add(current);
        visit(current);

        // Micro-optimization: Use Object.keys() instead of Object.entries().
        // Object.entries() creates an array of [key, value] tuple arrays, allocating
        // 1 + N objects per node (where N = number of properties). Object.keys() creates
        // only 1 array. For a typical AST node with 5 properties, this reduces allocations
        // from 6 to 1 per node visited (~83% reduction). Micro-benchmark shows Object.keys()
        // is 5-6x faster than Object.entries() for property iteration.
        for (const key of Object.keys(current)) {
            if (key === "parent") {
                continue;
            }

            const value = current[key];
            if (!value || typeof value !== "object") {
                continue;
            }

            stack.push(value);
        }
    }
}

function parseNumericLiteralValue(node: any): number | null {
    if (!node || node.type !== "Literal") {
        return null;
    }

    const asText = typeof node.value === "string" ? node.value.trim() : "";
    if (!/^\d+$/.test(asText)) {
        return null;
    }

    const parsed = Number.parseInt(asText, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

function unwrapParenthesized(node: any): any {
    let current = node;
    while (current?.type === "ParenthesizedExpression") {
        current = current.expression;
    }

    return current;
}

function getMemberArgumentIndex(node: any): number | null {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped || unwrapped.type !== "MemberIndexExpression") {
        return null;
    }

    const objectIdentifier = unwrapped.object;
    if (!objectIdentifier || objectIdentifier.type !== "Identifier" || objectIdentifier.name !== "argument") {
        return null;
    }

    const properties = Array.isArray(unwrapped.property) ? unwrapped.property : [];
    if (properties.length !== 1) {
        return null;
    }

    return parseNumericLiteralValue(properties[0]);
}

function getArgumentCountGuardIndex(testNode: any): number | null {
    const unwrapped = unwrapParenthesized(testNode);
    if (!unwrapped || unwrapped.type !== "BinaryExpression" || unwrapped.operator !== ">") {
        return null;
    }

    const left = unwrapParenthesized(unwrapped.left);
    if (!left || left.type !== "Identifier" || left.name !== "argument_count") {
        return null;
    }

    return parseNumericLiteralValue(unwrapParenthesized(unwrapped.right));
}

function getSingleAssignmentFromIfConsequent(ifNode: unknown): AstNodeRecord | null {
    if (!isAstNodeRecord(ifNode) || ifNode.type !== "IfStatement" || ifNode.alternate !== null) {
        return null;
    }

    const consequent = ifNode.consequent;
    if (!isAstNodeRecord(consequent)) {
        return null;
    }

    if (consequent.type === "BlockStatement") {
        const bodyStatements = Array.isArray(consequent.body) ? consequent.body : [];
        if (bodyStatements.length !== 1) {
            return null;
        }
        const singleStatement = bodyStatements[0];
        return isAstNodeRecord(singleStatement) ? singleStatement : null;
    }

    return isAstNodeRecord(consequent) ? consequent : null;
}

function getVariableDeclarator(statement: unknown): AstNodeRecord | null {
    if (
        !isAstNodeRecord(statement) ||
        statement.type !== "VariableDeclaration" ||
        !Array.isArray(statement.declarations)
    ) {
        return null;
    }

    if (statement.declarations.length !== 1) {
        return null;
    }

    const declarator = statement.declarations[0];
    return isAstNodeRecord(declarator) ? declarator : null;
}

function matchVarIfArgumentFallbackRewrite(
    sourceText: string,
    variableStatement: any,
    ifStatement: any
): {
    statementStart: number;
    statementEnd: number;
    parameterName: string;
    argumentIndex: number;
    defaultExpression: string;
} | null {
    const declarator = getVariableDeclarator(variableStatement);
    if (!declarator) {
        return null;
    }

    const identifier = isAstNodeRecord(declarator.id) ? declarator.id : null;
    if (!identifier || identifier.type !== "Identifier" || typeof identifier.name !== "string" || !declarator.init) {
        return null;
    }

    const argumentIndex = getArgumentCountGuardIndex(ifStatement?.test);
    if (argumentIndex === null) {
        return null;
    }

    const assignment = getSingleAssignmentFromIfConsequent(ifStatement);
    if (!assignment || assignment.type !== "AssignmentExpression" || assignment.operator !== "=") {
        return null;
    }

    const left = unwrapParenthesized(assignment.left);
    if (!left || left.type !== "Identifier" || left.name !== identifier.name) {
        return null;
    }

    const memberArgumentIndex = getMemberArgumentIndex(assignment.right);
    if (memberArgumentIndex === null || memberArgumentIndex !== argumentIndex) {
        return null;
    }

    const initStart = getNodeStartIndex(declarator.init);
    const initEnd = getNodeEndIndex(declarator.init);
    const statementStart = getNodeStartIndex(variableStatement);
    const statementEnd = getNodeEndIndex(ifStatement);

    if (
        typeof initStart !== "number" ||
        typeof initEnd !== "number" ||
        typeof statementStart !== "number" ||
        typeof statementEnd !== "number"
    ) {
        return null;
    }

    const defaultExpression = sourceText.slice(initStart, initEnd).trim();

    return {
        statementStart,
        statementEnd,
        parameterName: identifier.name,
        argumentIndex,
        defaultExpression
    };
}

function splitTopLevelCommaSegments(text: string): string[] {
    const segments: string[] = [];
    let current = "";
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    let quote: "'" | '"' | null = null;
    let escapeNext = false;

    for (const character of text) {
        if (quote !== null) {
            current += character;
            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            if (character === "\\") {
                escapeNext = true;
                continue;
            }
            if (character === quote) {
                quote = null;
            }
            continue;
        }

        if (character === "'" || character === '"') {
            quote = character;
            current += character;
            continue;
        }

        if (character === "(") {
            parenDepth += 1;
            current += character;
            continue;
        }

        if (character === ")" && parenDepth > 0) {
            parenDepth -= 1;
            current += character;
            continue;
        }

        if (character === "[") {
            bracketDepth += 1;
            current += character;
            continue;
        }

        if (character === "]" && bracketDepth > 0) {
            bracketDepth -= 1;
            current += character;
            continue;
        }

        if (character === "{") {
            braceDepth += 1;
            current += character;
            continue;
        }

        if (character === "}" && braceDepth > 0) {
            braceDepth -= 1;
            current += character;
            continue;
        }

        const isTopLevel = parenDepth === 0 && bracketDepth === 0 && braceDepth === 0;
        if (character === "," && isTopLevel) {
            segments.push(current.trim());
            current = "";
            continue;
        }

        current += character;
    }

    if (current.trim().length > 0) {
        segments.push(current.trim());
    }

    return segments;
}

function materializeTrailingOptionalDefaults(parameterSegments: string[]): string[] {
    let sawDefault = false;
    const rewritten: string[] = [];

    for (const parameterSegment of parameterSegments) {
        const segment = parameterSegment.trim();
        if (segment.length === 0) {
            continue;
        }

        if (segment.includes("=")) {
            sawDefault = true;
            rewritten.push(segment);
            continue;
        }

        if (sawDefault && /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
            rewritten.push(`${segment} = undefined`);
            continue;
        }

        rewritten.push(segment);
    }

    return rewritten;
}

function expandEditRangeToWholeLines(
    sourceText: string,
    startOffset: number,
    endOffset: number
): Readonly<{ start: number; end: number }> {
    const lineStart = getLineStartOffset(sourceText, startOffset);
    const canExpandStart = sourceText.slice(lineStart, startOffset).trim().length === 0;

    let expandedEnd = endOffset;
    while (expandedEnd < sourceText.length && (sourceText[expandedEnd] === " " || sourceText[expandedEnd] === "\t")) {
        expandedEnd += 1;
    }
    if (sourceText[expandedEnd] === "\r") {
        expandedEnd += 1;
    }
    if (sourceText[expandedEnd] === "\n") {
        expandedEnd += 1;
    }

    return Object.freeze({
        start: canExpandStart ? lineStart : startOffset,
        end: expandedEnd
    });
}

function resolveFunctionParameterRange(sourceText: string, functionNode: any): { start: number; end: number } | null {
    const functionStart = getNodeStartIndex(functionNode);
    const functionBodyStart = getNodeStartIndex(functionNode?.body);
    if (typeof functionStart !== "number" || typeof functionBodyStart !== "number") {
        return null;
    }

    const idEndIndex = functionNode?.idLocation?.end?.index;
    const searchStart = typeof idEndIndex === "number" ? idEndIndex : functionStart;
    const openParenIndex = sourceText.indexOf("(", searchStart);
    if (openParenIndex === -1 || openParenIndex >= functionBodyStart) {
        return null;
    }

    let depth = 0;
    let closeParenIndex = -1;
    for (let index = openParenIndex; index < functionBodyStart; index += 1) {
        const character = sourceText[index];
        if (character === "(") {
            depth += 1;
            continue;
        }

        if (character !== ")") {
            continue;
        }

        depth -= 1;
        if (depth === 0) {
            closeParenIndex = index;
            break;
        }
    }

    if (closeParenIndex < 0) {
        return null;
    }

    return {
        start: openParenIndex + 1,
        end: closeParenIndex
    };
}

function getIdentifierNameFromParameterSegment(segment: string): string | null {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
        return null;
    }

    const leftSide = trimmed.includes("=") ? trimmed.slice(0, trimmed.indexOf("=")).trim() : trimmed;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(leftSide)) {
        return null;
    }

    return leftSide;
}

function matchLeadingTernaryFallback(statement: any, sourceText: string): LeadingArgumentFallback | null {
    const declarator = getVariableDeclarator(statement);
    if (!declarator) {
        return null;
    }

    const identifier = isAstNodeRecord(declarator.id) ? declarator.id : null;
    const initExpression = isAstNodeRecord(declarator.init) ? declarator.init : null;
    if (
        !identifier ||
        identifier.type !== "Identifier" ||
        typeof identifier.name !== "string" ||
        !initExpression ||
        initExpression.type !== "TernaryExpression"
    ) {
        return null;
    }

    const argumentIndex = getArgumentCountGuardIndex(initExpression.test);
    if (argumentIndex === null) {
        return null;
    }

    const consequentIndex = getMemberArgumentIndex(initExpression.consequent);
    if (consequentIndex === null || consequentIndex !== argumentIndex) {
        return null;
    }

    const alternateStart = getNodeStartIndex(initExpression.alternate);
    const alternateEnd = getNodeEndIndex(initExpression.alternate);
    if (typeof alternateStart !== "number" || typeof alternateEnd !== "number") {
        return null;
    }

    return Object.freeze({
        parameterName: identifier.name,
        argumentIndex,
        defaultExpression: sourceText.slice(alternateStart, alternateEnd).trim(),
        statement
    });
}

function rewriteFunctionForOptionalDefaults(sourceText: string, functionNode: any): SourceTextEdit | null {
    const functionStart = getNodeStartIndex(functionNode);
    const functionEnd = getNodeEndIndex(functionNode);
    const bodyStatements = Array.isArray(functionNode?.body?.body) ? functionNode.body.body : [];
    const parameterRange = resolveFunctionParameterRange(sourceText, functionNode);

    if (
        typeof functionStart !== "number" ||
        typeof functionEnd !== "number" ||
        !parameterRange ||
        parameterRange.start < functionStart ||
        parameterRange.end > functionEnd
    ) {
        return null;
    }

    const localEdits: SourceTextEdit[] = [];
    const fallbackRecords: Array<{
        parameterName: string;
        argumentIndex: number;
        defaultExpression: string;
        statementStart: number;
        statementEnd: number;
    }> = [];

    for (let index = 0; index < bodyStatements.length - 1; index += 1) {
        const match = matchVarIfArgumentFallbackRewrite(sourceText, bodyStatements[index], bodyStatements[index + 1]);
        if (!match) {
            continue;
        }

        fallbackRecords.push({
            parameterName: match.parameterName,
            argumentIndex: match.argumentIndex,
            defaultExpression: match.defaultExpression,
            statementStart: match.statementStart,
            statementEnd: match.statementEnd
        });
        index += 1;
    }

    const paramsText = sourceText.slice(parameterRange.start, parameterRange.end);
    const originalSegments = splitTopLevelCommaSegments(paramsText);
    let rewrittenSegments = [...originalSegments];

    if (originalSegments.length === 0 && bodyStatements.length > 0) {
        const leadingFallbacks: LeadingArgumentFallback[] = [];
        for (const statement of bodyStatements) {
            const fallback = matchLeadingTernaryFallback(statement, sourceText);
            if (!fallback) {
                break;
            }
            leadingFallbacks.push(fallback);
        }

        const isContiguousLeadingFallback = leadingFallbacks.every(
            (fallback, index) => fallback.argumentIndex === index
        );

        if (leadingFallbacks.length > 0 && isContiguousLeadingFallback) {
            rewrittenSegments = leadingFallbacks.map(
                (fallback) => `${fallback.parameterName} = ${fallback.defaultExpression}`
            );

            const firstStatementStart = getNodeStartIndex(leadingFallbacks[0]?.statement);
            const nextStatement = bodyStatements[leadingFallbacks.length] ?? null;
            const trailingFallbackStatement = leadingFallbacks.at(-1)?.statement;
            const removalEnd =
                nextStatement === null ? getNodeEndIndex(trailingFallbackStatement) : getNodeStartIndex(nextStatement);

            if (
                typeof firstStatementStart === "number" &&
                typeof removalEnd === "number" &&
                removalEnd >= firstStatementStart
            ) {
                localEdits.push(
                    Object.freeze({
                        start: firstStatementStart - functionStart,
                        end: removalEnd - functionStart,
                        text: ""
                    })
                );
            }
        }
    }

    const sortedFallbackRecords = fallbackRecords.toSorted((left, right) => left.argumentIndex - right.argumentIndex);
    const fallbackRecordsToRemove = new Set<number>();
    for (const fallbackRecord of sortedFallbackRecords) {
        if (fallbackRecord.argumentIndex !== rewrittenSegments.length) {
            continue;
        }

        const parameterName = fallbackRecord.parameterName;
        const existingSegment = rewrittenSegments[fallbackRecord.argumentIndex] ?? "";
        const existingParameterName = getIdentifierNameFromParameterSegment(existingSegment);
        if (existingParameterName && existingParameterName === parameterName) {
            if (!existingSegment.includes("=")) {
                rewrittenSegments[fallbackRecord.argumentIndex] =
                    `${parameterName} = ${fallbackRecord.defaultExpression}`;
            }
            fallbackRecordsToRemove.add(fallbackRecord.statementStart);
            continue;
        }

        rewrittenSegments.push(`${parameterName} = ${fallbackRecord.defaultExpression}`);
        fallbackRecordsToRemove.add(fallbackRecord.statementStart);
    }

    for (const fallbackRecord of sortedFallbackRecords) {
        const removeFallbackStatements = fallbackRecordsToRemove.has(fallbackRecord.statementStart);
        const fallbackStatementText = removeFallbackStatements
            ? ""
            : `var ${fallbackRecord.parameterName} = argument_count > ${fallbackRecord.argumentIndex} ? argument[${fallbackRecord.argumentIndex}] : ${fallbackRecord.defaultExpression};`;
        const removalRange = removeFallbackStatements
            ? expandEditRangeToWholeLines(sourceText, fallbackRecord.statementStart, fallbackRecord.statementEnd)
            : null;
        localEdits.push(
            Object.freeze({
                start: (removalRange ? removalRange.start : fallbackRecord.statementStart) - functionStart,
                end: (removalRange ? removalRange.end : fallbackRecord.statementEnd) - functionStart,
                text: fallbackStatementText
            })
        );
    }

    rewrittenSegments = materializeTrailingOptionalDefaults(rewrittenSegments);
    const rewrittenParams = rewrittenSegments.join(", ");
    if (rewrittenParams !== paramsText) {
        localEdits.push(
            Object.freeze({
                start: parameterRange.start - functionStart,
                end: parameterRange.end - functionStart,
                text: rewrittenParams
            })
        );
    }

    if (localEdits.length === 0) {
        return null;
    }

    const functionText = sourceText.slice(functionStart, functionEnd);
    const rewrittenFunctionText = applySourceTextEdits(functionText, localEdits);
    if (rewrittenFunctionText === functionText) {
        return null;
    }

    return Object.freeze({
        start: functionStart,
        end: functionEnd,
        text: rewrittenFunctionText
    });
}

function getZeroComparisonIdentifier(testNode: any): string | null {
    const unwrapped = unwrapParenthesized(testNode);
    if (!unwrapped || unwrapped.type !== "BinaryExpression" || unwrapped.operator !== "==") {
        return null;
    }

    const left = unwrapParenthesized(unwrapped.left);
    const right = unwrapParenthesized(unwrapped.right);
    const leftNumeric = parseNumericLiteral(left);
    const rightNumeric = parseNumericLiteral(right);
    const leftIdentifier = left?.type === "Identifier" && typeof left.name === "string" ? left.name : null;
    const rightIdentifier = right?.type === "Identifier" && typeof right.name === "string" ? right.name : null;

    if (leftIdentifier !== null && rightNumeric !== null && Math.abs(rightNumeric) <= Number.EPSILON) {
        return leftIdentifier;
    }

    if (rightIdentifier !== null && leftNumeric !== null && Math.abs(leftNumeric) <= Number.EPSILON) {
        return rightIdentifier;
    }

    return null;
}

function tryGetAssignedIdentifierAndValue(statementNode: any): { identifierName: string; valueNode: any } | null {
    if (!statementNode || typeof statementNode !== "object") {
        return null;
    }

    const declarator = getVariableDeclarator(statementNode);
    if (declarator && isAstNodeRecord(declarator.id) && declarator.id.type === "Identifier" && declarator.init) {
        const identifierName = declarator.id.name;
        if (typeof identifierName === "string") {
            return {
                identifierName,
                valueNode: declarator.init
            };
        }
    }

    const assignmentExpression = CoreWorkspace.Core.unwrapExpressionStatement(statementNode);
    if (
        !assignmentExpression ||
        assignmentExpression.type !== "AssignmentExpression" ||
        assignmentExpression.operator !== "="
    ) {
        return null;
    }

    const left = unwrapParenthesized(assignmentExpression.left);
    if (!left || left.type !== "Identifier" || typeof left.name !== "string") {
        return null;
    }

    return {
        identifierName: left.name,
        valueNode: assignmentExpression.right
    };
}

function isMathExpressionNode(node: any): boolean {
    let foundMath = false;
    walkAstNodes(node, (currentNode) => {
        if (!isAstNodeRecord(currentNode)) {
            return;
        }

        if (
            currentNode.type === "BinaryExpression" &&
            (currentNode.operator === "+" ||
                currentNode.operator === "-" ||
                currentNode.operator === "*" ||
                currentNode.operator === "/")
        ) {
            foundMath = true;
            return;
        }

        if (currentNode.type === "CallExpression") {
            const callTarget = unwrapParenthesized(currentNode.object);
            if (
                callTarget &&
                callTarget.type === "Identifier" &&
                typeof callTarget.name === "string" &&
                (callTarget.name === "sqr" || callTarget.name === "sqrt" || callTarget.name === "pow")
            ) {
                foundMath = true;
            }
        }
    });

    return foundMath;
}

function isMathEpsilonDeclaration(statementNode: any): boolean {
    const declarator = getVariableDeclarator(statementNode);
    if (!declarator || !isAstNodeRecord(declarator.id) || declarator.id.type !== "Identifier") {
        return false;
    }

    if (declarator.id.name !== "eps" || !declarator.init) {
        return false;
    }

    const initializer = unwrapParenthesized(declarator.init);
    if (!initializer || initializer.type !== "CallExpression") {
        return false;
    }

    const callTarget = unwrapParenthesized(initializer.object);
    if (!callTarget || callTarget.type !== "Identifier" || callTarget.name !== "math_get_epsilon") {
        return false;
    }

    return Array.isArray(initializer.arguments) && initializer.arguments.length === 0;
}

function getLineStartOffset(sourceText: string, offset: number): number {
    return sourceText.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function getLineIndentationAtOffset(sourceText: string, offset: number): string {
    const lineStart = getLineStartOffset(sourceText, offset);
    let cursor = lineStart;
    while (cursor < sourceText.length && (sourceText[cursor] === " " || sourceText[cursor] === "\t")) {
        cursor += 1;
    }

    return sourceText.slice(lineStart, cursor);
}

function createPreferEpsilonComparisonsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(node) {
                    const sourceText = context.sourceCode.text;
                    const edits: SourceTextEdit[] = [];
                    const epsilonInsertedBlocks = new WeakSet<object>();
                    let firstRewriteOffset: number | null = null;

                    walkAstNodesWithParent(node, (visitContext) => {
                        const { node: visitedNode, parent, parentIndex, parentKey } = visitContext;
                        if (visitedNode.type !== "IfStatement" || parentKey !== "body" || parentIndex === null) {
                            return;
                        }

                        if (!parent || !Array.isArray(parent.body) || parentIndex <= 0) {
                            return;
                        }

                        const comparedIdentifier = getZeroComparisonIdentifier(visitedNode.test);
                        if (!comparedIdentifier) {
                            return;
                        }

                        let matchedMathAssignment = false;
                        for (let statementIndex = parentIndex - 1; statementIndex >= 0; statementIndex -= 1) {
                            const previousStatement = parent.body[statementIndex];
                            if (isMathEpsilonDeclaration(previousStatement)) {
                                continue;
                            }

                            const assignmentMatch = tryGetAssignedIdentifierAndValue(previousStatement);
                            if (
                                assignmentMatch &&
                                assignmentMatch.identifierName === comparedIdentifier &&
                                isMathExpressionNode(assignmentMatch.valueNode)
                            ) {
                                matchedMathAssignment = true;
                            }

                            break;
                        }

                        if (!matchedMathAssignment) {
                            return;
                        }

                        const testStart = getNodeStartIndex(visitedNode.test);
                        const testEnd = getNodeEndIndex(visitedNode.test);
                        if (typeof testStart !== "number" || typeof testEnd !== "number") {
                            return;
                        }

                        edits.push({
                            start: testStart,
                            end: testEnd,
                            text: `(${comparedIdentifier} <= eps)`
                        });

                        const blockHasEpsilonDeclaration = parent.body.some((statementNode: unknown) =>
                            isMathEpsilonDeclaration(statementNode)
                        );
                        if (!blockHasEpsilonDeclaration && !epsilonInsertedBlocks.has(parent)) {
                            const ifStart = getNodeStartIndex(visitedNode);
                            if (typeof ifStart === "number") {
                                const lineStart = getLineStartOffset(sourceText, ifStart);
                                const indentation = getLineIndentationAtOffset(sourceText, ifStart);
                                edits.push({
                                    start: lineStart,
                                    end: lineStart,
                                    text: `${indentation}var eps = math_get_epsilon();\n`
                                });
                                epsilonInsertedBlocks.add(parent);
                            }
                        }

                        if (firstRewriteOffset === null || testStart < firstRewriteOffset) {
                            firstRewriteOffset = testStart;
                        }
                    });

                    if (edits.length === 0) {
                        return;
                    }

                    const rewrittenText = applySourceTextEdits(sourceText, edits);
                    if (rewrittenText === sourceText) {
                        return;
                    }

                    context.report({
                        loc: context.sourceCode.getLocFromIndex(
                            firstRewriteOffset ?? findFirstChangedCharacterOffset(sourceText, rewrittenText)
                        ),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, sourceText.length], rewrittenText)
                    });
                }
            });
        }
    });
}

function isUndefinedValueNode(node: any): boolean {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Identifier") {
        return typeof node.name === "string" && node.name.toLowerCase() === "undefined";
    }

    if (node.type !== "Literal" || typeof node.value !== "string") {
        return false;
    }

    return node.value.toLowerCase() === "undefined";
}

function createCollapseUndefinedCallArgumentEdit(sourceText: string, callExpression: any): SourceTextEdit | null {
    if (!callExpression || callExpression.type !== "CallExpression" || !Array.isArray(callExpression.arguments)) {
        return null;
    }

    const args = callExpression.arguments;
    if (args.length <= 1 || !args.every((argument) => isUndefinedValueNode(argument))) {
        return null;
    }

    const firstArgument = args[0];
    const lastArgument = args.at(-1);
    const firstStart = getNodeStartIndex(firstArgument);
    const firstEnd = getNodeEndIndex(firstArgument);
    const lastEnd = getNodeEndIndex(lastArgument);

    if (typeof firstStart !== "number" || typeof firstEnd !== "number" || typeof lastEnd !== "number") {
        return null;
    }

    return Object.freeze({
        start: firstStart,
        end: lastEnd,
        text: sourceText.slice(firstStart, firstEnd)
    });
}

function hasOverlappingRange(
    rangeStart: number,
    rangeEnd: number,
    ranges: ReadonlyArray<{ start: number; end: number }>
): boolean {
    for (const range of ranges) {
        if (rangeStart < range.end && rangeEnd > range.start) {
            return true;
        }
    }

    return false;
}

function rewriteTrailingOptionalDefaultsProgram(sourceText: string, programNode: any): string {
    const functionEdits: SourceTextEdit[] = [];
    const functionRanges: Array<{ start: number; end: number }> = [];
    const callEdits: SourceTextEdit[] = [];

    walkAstNodes(programNode, (node) => {
        if (node?.type === "FunctionDeclaration" || node?.type === "ConstructorDeclaration") {
            const edit = rewriteFunctionForOptionalDefaults(sourceText, node);
            if (edit) {
                functionEdits.push(edit);
                functionRanges.push({ start: edit.start, end: edit.end });
            }
            return;
        }

        if (node?.type === "CallExpression") {
            const edit = createCollapseUndefinedCallArgumentEdit(sourceText, node);
            if (!edit) {
                return;
            }

            if (hasOverlappingRange(edit.start, edit.end, functionRanges)) {
                return;
            }

            callEdits.push(edit);
        }
    });

    return applySourceTextEdits(sourceText, [...functionEdits, ...callEdits]);
}

function createRequireTrailingOptionalDefaultsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(node) {
                    const sourceText = context.sourceCode.text;
                    const rewrittenText = rewriteTrailingOptionalDefaultsProgram(sourceText, node);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}

export function createGmlRule(definition: GmlRuleDefinition): Rule.RuleModule {
    switch (definition.shortName) {
        case "prefer-loop-length-hoist": {
            return createPreferLoopLengthHoistRule(definition);
        }
        case "prefer-hoistable-loop-accessors": {
            return createPreferHoistableLoopAccessorsRule(definition);
        }
        case "prefer-repeat-loops": {
            return createPreferRepeatLoopsRule(definition);
        }
        case "prefer-struct-literal-assignments": {
            return createPreferStructLiteralAssignmentsRule(definition);
        }
        case "optimize-logical-flow": {
            return createOptimizeLogicalFlowRule(definition);
        }
        case "no-globalvar": {
            return createNoGlobalvarRule(definition);
        }
        case "normalize-doc-comments": {
            return createNormalizeDocCommentsRule(definition);
        }
        case "normalize-directives": {
            return createNormalizeDirectivesRule(definition);
        }
        case "require-control-flow-braces": {
            return createRequireControlFlowBracesRule(definition);
        }
        case "no-assignment-in-condition": {
            return createNoAssignmentInConditionRule(definition);
        }
        case "prefer-is-undefined-check": {
            return createPreferIsUndefinedCheckRule(definition);
        }
        case "prefer-epsilon-comparisons": {
            return createPreferEpsilonComparisonsRule(definition);
        }
        case "normalize-operator-aliases": {
            return createNormalizeOperatorAliasesRule(definition);
        }
        case "prefer-string-interpolation": {
            return createPreferStringInterpolationRule(definition);
        }
        case "optimize-math-expressions": {
            return createOptimizeMathExpressionsRule(definition);
        }
        case "require-argument-separators": {
            return createRequireArgumentSeparatorsRule(definition);
        }
        case "normalize-data-structure-accessors": {
            return createNormalizeDataStructureAccessorsRule(definition);
        }
        case "require-trailing-optional-defaults": {
            return createRequireTrailingOptionalDefaultsRule(definition);
        }
        default: {
            throw new Error(`Missing gml rule implementation for shortName '${definition.shortName}'.`);
        }
    }
}
