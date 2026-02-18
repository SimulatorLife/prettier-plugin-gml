import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import { createLimitedRecoveryProjection } from "../../language/recovery.js";
import type { ProjectCapability, UnsafeReasonCode } from "../../types/index.js";
import type { GmlRuleDefinition } from "../catalog.js";
import { reportMissingProjectContextOncePerFile, resolveProjectContextForRule } from "../project-context.js";
import { dominantLineEnding, isIdentifier, readObjectOption, shouldReportUnsafe } from "./rule-helpers.js";

const { getNodeStartIndex, getNodeEndIndex, isObjectLike } = CoreWorkspace.Core;

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

type AstNodeRecord = Record<string, unknown>;

function isAstNodeRecord(value: unknown): value is AstNodeRecord {
    return isObjectLike(value) && !Array.isArray(value);
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

function createPreferLoopLengthHoistRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const functionSuffixes = options.functionSuffixes as Record<string, string | null> | undefined;

            const enabledFunctions: Array<string> = [];
            for (const [functionName] of Object.entries(DEFAULT_HOIST_ACCESSORS)) {
                const userSuffix = functionSuffixes?.[functionName];
                if (userSuffix === null) {
                    continue;
                }
                enabledFunctions.push(functionName);
            }

            if (functionSuffixes) {
                for (const [functionName, suffix] of Object.entries(functionSuffixes)) {
                    if (suffix !== null && !(functionName in DEFAULT_HOIST_ACCESSORS)) {
                        enabledFunctions.push(functionName);
                    }
                }
            }

            const listener: Rule.RuleListener = {
                Program(node) {
                    if (enabledFunctions.length === 0) {
                        return;
                    }

                    const text = context.sourceCode.text;
                    const functionsPattern = enabledFunctions.map((fn) => escapeRegularExpressionPattern(fn)).join("|");
                    const loopPattern = new RegExp(
                        String.raw`for\s*\([^)]*(?:${functionsPattern})\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)`,
                        "g"
                    );
                    if (loopPattern.test(text)) {
                        context.report({
                            node,
                            messageId: definition.messageId
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

function createPreferHoistableLoopAccessorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const minOccurrences = typeof options.minOccurrences === "number" ? options.minOccurrences : 2;

            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const accessPattern = /array_length\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;
                    const identifierOccurrences = new Map<string, { count: number; firstOffset: number }>();
                    for (const match of text.matchAll(accessPattern)) {
                        const identifier = match[1];
                        const firstOffset = match.index ?? 0;
                        const existing = identifierOccurrences.get(identifier);
                        if (existing) {
                            existing.count += 1;
                            continue;
                        }

                        identifierOccurrences.set(identifier, {
                            count: 1,
                            firstOffset
                        });
                    }

                    let firstReportOffset: number | null = null;
                    for (const occurrence of identifierOccurrences.values()) {
                        if (occurrence.count < minOccurrences) {
                            continue;
                        }

                        if (firstReportOffset === null || occurrence.firstOffset < firstReportOffset) {
                            firstReportOffset = occurrence.firstOffset;
                        }
                    }

                    if (firstReportOffset === null) {
                        return;
                    }

                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstReportOffset),
                        messageId: definition.messageId
                    });
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
            const listener: Rule.RuleListener = {
                Program() {
                    const text = context.sourceCode.text;
                    const lines = text.split(/\r?\n/);
                    const lineStartOffsets = computeLineStartOffsets(text);
                    const assignmentPattern =
                        /^\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\S.*|\s);\s*$/u;
                    for (let index = 0; index < lines.length - 1; index += 1) {
                        const firstMatch = assignmentPattern.exec(lines[index]);
                        const secondMatch = assignmentPattern.exec(lines[index + 1]);
                        if (!firstMatch || !secondMatch) {
                            continue;
                        }

                        if (firstMatch[1] !== secondMatch[1]) {
                            continue;
                        }

                        if (!isIdentifier(firstMatch[1])) {
                            continue;
                        }

                        const assignmentColumnOffset = lines[index].search(/[A-Za-z_]/u);
                        const reportOffset = (lineStartOffsets[index] ?? 0) + Math.max(assignmentColumnOffset, 0);
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(reportOffset),
                            messageId: definition.messageId
                        });
                        break;
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

function createOptimizeLogicalFlowRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const pattern = /!!\s*([A-Za-z_][A-Za-z0-9_]*)/g;
                    for (const match of text.matchAll(pattern)) {
                        const start = match.index ?? 0;
                        const full = match[0];
                        const variableName = match[1];
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(start),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([start, start + full.length], variableName)
                        });
                    }
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
    parameterNames: ReadonlyArray<string>;
}>;

type TrailingDocCommentBlock = Readonly<{
    startIndex: number;
    lines: ReadonlyArray<string>;
}>;

type SyntheticDocCommentParameterNode = Readonly<{
    type: "Identifier";
    name: string;
}>;

type SyntheticDocCommentFunctionNode = Readonly<{
    type: "FunctionDeclaration";
    params: ReadonlyArray<SyntheticDocCommentParameterNode>;
    body: Readonly<{
        type: "BlockStatement";
        body: ReadonlyArray<unknown>;
    }>;
}>;

function toDocCommentParameterName(parameterName: string): string {
    return parameterName.replace(/^_+/u, "");
}

function parseFunctionParameterNames(parameterListText: string): Array<string> {
    const parameterNames = parameterListText
        .split(",")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .map((segment) => {
            const equalsIndex = segment.indexOf("=");
            const withoutDefault = equalsIndex === -1 ? segment : segment.slice(0, equalsIndex);
            return withoutDefault.replace(/^\.\.\./u, "").trim();
        })
        .filter((parameterName) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(parameterName))
        .map((parameterName) => toDocCommentParameterName(parameterName));

    return [...new Set(parameterNames)];
}

function parseFunctionDocCommentTarget(line: string): FunctionDocCommentTarget | null {
    const declarationMatch =
        /^(\s*)(?:static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:constructor\s*)?(?:\{\s*.*\s*\}?\s*)?$/u.exec(
            line
        );
    if (declarationMatch) {
        return {
            indentation: declarationMatch[1],
            functionName: declarationMatch[2],
            parameterNames: parseFunctionParameterNames(declarationMatch[3])
        };
    }

    const assignmentMatch =
        /^(\s*)(?:var\s+|static\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\(([^)]*)\)\s*(?:constructor\s*)?(?:\{\s*.*\s*\}?\s*)?$/u.exec(
            line
        );
    if (!assignmentMatch) {
        return null;
    }

    return {
        indentation: assignmentMatch[1],
        functionName: assignmentMatch[2],
        parameterNames: parseFunctionParameterNames(assignmentMatch[3])
    };
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
        const metadata = CoreWorkspace.Core.parseDocCommentMetadata(line);
        if (!metadata) {
            return line;
        }

        const indentationMatch = /^(\s*)\/\/\//u.exec(line);
        const indentation = indentationMatch?.[1] ?? "";

        if (metadata.tag === "arg" || metadata.tag === "argument") {
            if (typeof metadata.name !== "string") {
                return line;
            }

            const typePrefix =
                typeof metadata.type === "string" && metadata.type.trim().length > 0
                    ? ` {${metadata.type.trim()}}`
                    : "";
            const descriptionText =
                typeof metadata.description === "string" && metadata.description.trim().length > 0
                    ? ` - ${metadata.description.trim()}`
                    : "";
            return `${indentation}/// @param${typePrefix} ${metadata.name.trim()}${descriptionText}`.trimEnd();
        }

        if (metadata.tag === "return") {
            const returnsText = typeof metadata.name === "string" ? metadata.name.trim() : "";
            const returnsSuffix = returnsText.length > 0 ? ` ${returnsText}` : "";
            return `${indentation}/// @returns${returnsSuffix}`;
        }

        return line;
    });
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

function createSyntheticDocCommentFunctionNode(target: FunctionDocCommentTarget): SyntheticDocCommentFunctionNode {
    const params: ReadonlyArray<SyntheticDocCommentParameterNode> = target.parameterNames.map((parameterName) => ({
        type: "Identifier",
        name: parameterName
    }));

    return {
        type: "FunctionDeclaration",
        params,
        body: {
            type: "BlockStatement",
            body: []
        }
    };
}

type ExistingDocCommentState = Readonly<{
    paramCanonicalNames: ReadonlySet<string>;
    hasReturnsTag: boolean;
}>;

function collectExistingDocCommentState(docLines: ReadonlyArray<string>): ExistingDocCommentState {
    const paramCanonicalNames = new Set<string>();
    let hasReturnsTag = false;

    for (const line of docLines) {
        const metadata = CoreWorkspace.Core.parseDocCommentMetadata(line);
        if (!metadata) {
            continue;
        }

        if (metadata.tag === "return" || metadata.tag === "returns") {
            hasReturnsTag = true;
            continue;
        }

        if (
            (metadata.tag === "param" || metadata.tag === "arg" || metadata.tag === "argument") &&
            typeof metadata.name === "string"
        ) {
            const canonicalName = CoreWorkspace.Core.getCanonicalParamNameFromText(metadata.name);
            if (canonicalName) {
                paramCanonicalNames.add(canonicalName);
            }
        }
    }

    return {
        paramCanonicalNames,
        hasReturnsTag
    };
}

function withTargetIndentation(indentation: string, line: string): string {
    if (line.trim().length === 0) {
        return line;
    }

    return `${indentation}${line.trimStart()}`;
}

function synthesizeFunctionDocCommentBlock(
    target: FunctionDocCommentTarget,
    existingDocLines: ReadonlyArray<string> | null
): ReadonlyArray<string> | null {
    const docLinesWithoutPlaceholders = (existingDocLines ?? []).filter(
        (line) => !isFunctionNamePlaceholderDescription(line, target.functionName)
    );
    const canonicalizedDocLines = canonicalizeDocCommentTagAliases(docLinesWithoutPlaceholders);
    const syntheticDocLines = CoreWorkspace.Core.computeSyntheticFunctionDocLines(
        createSyntheticDocCommentFunctionNode(target),
        canonicalizedDocLines,
        {}
    );
    const existingDocCommentState = collectExistingDocCommentState(canonicalizedDocLines);
    const existingParamCanonicalNames = new Set(existingDocCommentState.paramCanonicalNames);
    let hasReturnsTag = existingDocCommentState.hasReturnsTag;
    const mergedDocLines = [...canonicalizedDocLines];

    for (const syntheticLine of syntheticDocLines) {
        const metadata = CoreWorkspace.Core.parseDocCommentMetadata(syntheticLine);
        if (!metadata) {
            const normalizedSyntheticLine = withTargetIndentation(target.indentation, syntheticLine);
            if (!mergedDocLines.includes(normalizedSyntheticLine)) {
                mergedDocLines.push(normalizedSyntheticLine);
            }
            continue;
        }

        if (metadata.tag === "return" || metadata.tag === "returns") {
            if (hasReturnsTag) {
                continue;
            }

            mergedDocLines.push(withTargetIndentation(target.indentation, syntheticLine));
            hasReturnsTag = true;
            continue;
        }

        if (metadata.tag === "param" && typeof metadata.name === "string") {
            const canonicalName = CoreWorkspace.Core.getCanonicalParamNameFromText(metadata.name);
            if (canonicalName && existingParamCanonicalNames.has(canonicalName)) {
                continue;
            }

            mergedDocLines.push(withTargetIndentation(target.indentation, syntheticLine));
            if (canonicalName) {
                existingParamCanonicalNames.add(canonicalName);
            }
            continue;
        }

        const normalizedSyntheticLine = withTargetIndentation(target.indentation, syntheticLine);
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
                Program() {
                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
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
                    for (const line of lines) {
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
                            const trailingDocCommentBlock = readTrailingDocCommentBlock(rewrittenLines);
                            const synthesizedDocCommentBlock = synthesizeFunctionDocCommentBlock(
                                docCommentTarget,
                                trailingDocCommentBlock?.lines ?? null
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
                    if (rewritten === text) {
                        return;
                    }

                    const firstChangedOffset = findFirstChangedCharacterOffset(text, rewritten);
                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, text.length], rewritten)
                    });
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

    const standaloneEnd = /^(\s*)end\s*;?\s*$/iu.exec(codePortion);
    if (standaloneEnd) {
        return `${standaloneEnd[1]}}${commentPortion}`;
    }

    if (/\bbegin\s*;?\s*$/iu.test(codePortion)) {
        return `${codePortion.replace(/\bbegin\s*;?\s*$/iu, "{")}${commentPortion}`;
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

    const legacyMacro = /^(\s*)#(macro|define)\s+([A-Za-z_][A-Za-z0-9_]*)(.*)$/u.exec(line);
    if (!legacyMacro) {
        return normalizeLegacyBlockKeywordLine(line);
    }

    const indentation = legacyMacro[1];
    const rawTail = legacyMacro[4];
    const lineCommentIndex = rawTail.indexOf("//");
    const bodyPortion = lineCommentIndex === -1 ? rawTail : rawTail.slice(0, lineCommentIndex);
    const commentPortion = lineCommentIndex === -1 ? "" : rawTail.slice(lineCommentIndex).trimEnd();
    const normalizedBody = bodyPortion.trim().replace(/;\s*$/u, "");
    const normalizedComment = commentPortion.length > 0 ? ` ${commentPortion}` : "";

    if (normalizedBody.length === 0) {
        return `${indentation}#macro ${legacyMacro[3]}${normalizedComment}`;
    }

    return `${indentation}#macro ${legacyMacro[3]} ${normalizedBody}${normalizedComment}`;
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
    const inlineDoUntil = /^(\s*)do\s+(?!\{)([^;{}].*;\s*)until\s*\((.+)\)\s*;?\s*$/u.exec(line);
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
    const untilFooterMatch = /^\s*until\s*\((.+)\)\s*;?\s*$/u.exec(line);
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
                    if (rewritten === text) {
                        return;
                    }

                    const firstChangedOffset = findFirstChangedCharacterOffset(text, rewritten);
                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, text.length], rewritten)
                    });
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
                    if (rewritten === text) {
                        return;
                    }

                    const firstChangedOffset = findFirstChangedCharacterOffset(text, rewritten);
                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, text.length], rewritten)
                    });
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

                    if (rewritten === text) {
                        return;
                    }

                    const firstChangedOffset = findFirstChangedCharacterOffset(text, rewritten);
                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, text.length], rewritten)
                    });
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

                    if (rewritten === text) {
                        return;
                    }

                    const firstChangedOffset = findFirstChangedCharacterOffset(text, rewritten);
                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, text.length], rewritten)
                    });
                }
            });
        }
    });
}

function createPreferStringInterpolationRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const listener: Rule.RuleListener = {
                Program(node) {
                    const text = context.sourceCode.text;
                    const pattern = /"[^"]*"\s*\+\s*string\(/g;
                    const isUnsafeReportingEnabled = shouldReportUnsafe(context);
                    if (isUnsafeReportingEnabled && pattern.test(text)) {
                        context.report({
                            node,
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

function createOptimizeMathExpressionsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*\+\s*0\b(?!\s*\.)/g;
                    for (const match of text.matchAll(pattern)) {
                        const start = match.index ?? 0;
                        const end = start + match[0].length;
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(start),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([start, end], match[1])
                        });
                    }
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

        for (const [key, value] of Object.entries(current)) {
            if (key === "parent") {
                continue;
            }

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
    replacementStart: number;
    replacementEnd: number;
    replacementText: string;
    parameterName: string;
    argumentIndex: number;
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
    const replacementStart = getNodeStartIndex(variableStatement);
    const replacementEnd = getNodeEndIndex(ifStatement);

    if (
        typeof initStart !== "number" ||
        typeof initEnd !== "number" ||
        typeof replacementStart !== "number" ||
        typeof replacementEnd !== "number"
    ) {
        return null;
    }

    const fallbackExpression = sourceText.slice(initStart, initEnd).trim();

    return {
        replacementStart,
        replacementEnd,
        replacementText: `var ${identifier.name} = argument_count > ${argumentIndex} ? argument[${argumentIndex}] : ${fallbackExpression};`,
        parameterName: identifier.name,
        argumentIndex
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
    const fallbackRecords: Array<{ parameterName: string; argumentIndex: number }> = [];

    for (let index = 0; index < bodyStatements.length - 1; index += 1) {
        const match = matchVarIfArgumentFallbackRewrite(sourceText, bodyStatements[index], bodyStatements[index + 1]);
        if (!match) {
            continue;
        }

        localEdits.push(
            Object.freeze({
                start: match.replacementStart - functionStart,
                end: match.replacementEnd - functionStart,
                text: match.replacementText
            })
        );
        fallbackRecords.push({
            parameterName: match.parameterName,
            argumentIndex: match.argumentIndex
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
    for (const fallbackRecord of sortedFallbackRecords) {
        if (fallbackRecord.argumentIndex !== rewrittenSegments.length) {
            continue;
        }

        const parameterName = fallbackRecord.parameterName;
        const existingParameterName = getIdentifierNameFromParameterSegment(
            rewrittenSegments[fallbackRecord.argumentIndex] ?? ""
        );
        if (existingParameterName && existingParameterName === parameterName) {
            continue;
        }

        rewrittenSegments.push(parameterName);
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

function isUndefinedArgumentValue(node: any): boolean {
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
    if (args.length <= 1 || !args.every((argument) => isUndefinedArgumentValue(argument))) {
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
                    if (rewrittenText === sourceText) {
                        return;
                    }

                    const firstChangedOffset = findFirstChangedCharacterOffset(sourceText, rewrittenText);
                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, sourceText.length], rewrittenText)
                    });
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
