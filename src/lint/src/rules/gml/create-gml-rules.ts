import type { Rule } from "eslint";

import { createLimitedRecoveryProjection } from "../../language/recovery.js";
import type { ProjectCapability, UnsafeReasonCode } from "../../types/index.js";
import type { GmlRuleDefinition } from "../catalog.js";
import { reportMissingProjectContextOncePerFile, resolveProjectContextForRule } from "../project-context.js";
import { dominantLineEnding, isIdentifier, readObjectOption, shouldReportUnsafe } from "./rule-helpers.js";

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
                Program(node) {
                    const text = context.sourceCode.text;
                    const lines = text.split(/\r?\n/);
                    for (let index = 0; index < lines.length - 1; index += 1) {
                        const firstMatch = lines[index].match(
                            /^\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\S.*|\s);\s*$/
                        );
                        const secondMatch = lines[index + 1].match(
                            /^\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\S.*|\s);\s*$/
                        );
                        if (!firstMatch || !secondMatch) {
                            continue;
                        }

                        if (firstMatch[1] !== secondMatch[1]) {
                            continue;
                        }

                        if (!isIdentifier(firstMatch[1])) {
                            continue;
                        }

                        context.report({ node, messageId: definition.messageId });
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
            const listener: Rule.RuleListener = {
                Program() {
                    const text = context.sourceCode.text;
                    const sourcePath = context.sourceCode.parserServices?.gml?.filePath;
                    const filePath = typeof sourcePath === "string" ? sourcePath : null;
                    const pattern = /(^|\r?\n)(\s*)globalvar\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
                    const assessGlobalVarRewrite =
                        projectContext.context && typeof projectContext.context.assessGlobalVarRewrite === "function"
                            ? projectContext.context.assessGlobalVarRewrite.bind(projectContext.context)
                            : null;
                    for (const match of text.matchAll(pattern)) {
                        const start = (match.index ?? 0) + match[1].length;
                        const end = start + match[2].length + "globalvar".length + 1 + match[3].length + 1;
                        const rewriteAssessment = assessGlobalVarRewrite?.(filePath, false) ?? {
                            allowRewrite: true,
                            reason: null
                        };
                        if (!rewriteAssessment.allowRewrite) {
                            if (shouldReportUnsafeFixes) {
                                context.report({
                                    loc: context.sourceCode.getLocFromIndex(start),
                                    messageId: "unsafeFix"
                                });
                            } else {
                                context.report({
                                    loc: context.sourceCode.getLocFromIndex(start),
                                    messageId: definition.messageId
                                });
                            }
                            continue;
                        }

                        if (!enableAutofix) {
                            context.report({
                                loc: context.sourceCode.getLocFromIndex(start),
                                messageId: definition.messageId
                            });
                            continue;
                        }

                        context.report({
                            loc: context.sourceCode.getLocFromIndex(start),
                            messageId: definition.messageId,
                            fix: (fixer) =>
                                fixer.replaceTextRange([start, end], `${match[2]}global.${match[3]} = undefined;`)
                        });
                    }
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

    const legacyDocLikeMatch = /^(\s*)\/\/\s*\/\s*(.*)$/u.exec(line);
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
        /^(\s*)(?:static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:constructor\s*)?(?:\{\s*\}?\s*)?$/u.exec(
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
        /^(\s*)(?:var\s+|static\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\(([^)]*)\)\s*(?:constructor\s*)?(?:\{\s*\}?\s*)?$/u.exec(
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

function collectExistingDocParamNames(docLines: ReadonlyArray<string>): ReadonlySet<string> {
    const parameterNames = new Set<string>();
    const paramPattern = /^\s*\/\/\/\s*@param\s*(?:\{[^}]*\}\s*)?(\[[^\]]+\]|\S+)/u;

    for (const line of docLines) {
        const paramMatch = paramPattern.exec(line);
        if (!paramMatch) {
            continue;
        }

        const bracketless = paramMatch[1].replace(/^\[/u, "").replace(/\]$/u, "");
        const normalized = bracketless.split("=")[0]?.trim() ?? "";
        if (normalized.length > 0) {
            parameterNames.add(normalized);
        }
    }

    return parameterNames;
}

function synthesizeFunctionDocCommentBlock(
    target: FunctionDocCommentTarget,
    existingDocLines: ReadonlyArray<string> | null
): ReadonlyArray<string> | null {
    const docLines = existingDocLines ? [...existingDocLines] : [];
    const hasDescription = docLines.some((line) => /^\s*\/\/\/\s*@description\b/u.test(line));
    const hasReturns = docLines.some((line) => /^\s*\/\/\/\s*@returns\b/u.test(line));
    const existingParamNames = collectExistingDocParamNames(docLines);
    const missingParamNames = target.parameterNames.filter((parameterName) => !existingParamNames.has(parameterName));

    if (!hasDescription) {
        docLines.unshift(`${target.indentation}/// @description ${target.functionName}`);
    }

    for (const parameterName of missingParamNames) {
        docLines.push(`${target.indentation}/// @param ${parameterName}`);
    }

    if (!hasReturns) {
        docLines.push(`${target.indentation}/// @returns {undefined}`);
    }

    if (existingDocLines) {
        const hasChanged =
            docLines.length !== existingDocLines.length ||
            docLines.some((line, index) => line !== existingDocLines[index]);
        return hasChanged ? docLines : null;
    }

    return docLines;
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

                        const nonEmptyDescriptionPattern = /^(\s*)\/\/\/\s*@description\s+(.+)$/u;
                        const emptyDescriptionPattern = /^(\s*)\/\/\/\s*@description\s*$/u;
                        const plainDocLinePattern = /^(\s*)\/\/\/\s+(?!@)(.+)$/u;
                        const tagDocLinePattern = /^(\s*)\/\/\/\s+@/u;

                        const normalizedBlock = blockLines
                            .filter((line) => !emptyDescriptionPattern.test(line))
                            .map((line) => normalizeDocCommentPrefixLine(line));

                        const hasDescription = normalizedBlock.some((line) => nonEmptyDescriptionPattern.test(line));
                        if (hasDescription) {
                            rewrittenLines.push(...normalizedBlock);
                            return;
                        }

                        const firstPlainIndex = normalizedBlock.findIndex((line) => plainDocLinePattern.test(line));
                        if (firstPlainIndex === -1) {
                            rewrittenLines.push(...normalizedBlock);
                            return;
                        }

                        const firstPlainMatch = plainDocLinePattern.exec(normalizedBlock[firstPlainIndex]);
                        if (!firstPlainMatch) {
                            rewrittenLines.push(...normalizedBlock);
                            return;
                        }

                        const indentation = firstPlainMatch[1];
                        const descriptionText = firstPlainMatch[2].trimEnd();
                        normalizedBlock[firstPlainIndex] = `${indentation}/// @description ${descriptionText}`;

                        for (let index = firstPlainIndex + 1; index < normalizedBlock.length; index += 1) {
                            const line = normalizedBlock[index];
                            if (tagDocLinePattern.test(line)) {
                                break;
                            }

                            const plainMatch = plainDocLinePattern.exec(line);
                            if (!plainMatch) {
                                continue;
                            }

                            normalizedBlock[index] = `${plainMatch[1]}///              ${plainMatch[2].trimEnd()}`;
                        }

                        rewrittenLines.push(...normalizedBlock);
                    };

                    let pendingDocBlock: Array<string> = [];
                    for (const line of lines) {
                        if (/^\s*\/\/\//u.test(line) || /^\s*\/\/\s*[@/]/u.test(line)) {
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

function parseInlineControlFlowClauseWithLegacyIf(line: string): BracedSingleClause | null {
    const inlineControlFlowClause = parseInlineControlFlowClause(line);
    if (inlineControlFlowClause) {
        return inlineControlFlowClause;
    }

    const legacyNoParens = /^(\s*)if\s+(.+);\s*$/u.exec(line);
    if (!legacyNoParens) {
        return null;
    }

    const indentation = legacyNoParens[1];
    const payload = legacyNoParens[2].trim();
    if (payload.includes("{") || payload.includes("}") || /\belse\b/u.test(payload)) {
        return null;
    }

    const lastClosingParenIndex = payload.lastIndexOf(")");
    if (lastClosingParenIndex <= 0 || lastClosingParenIndex >= payload.length - 1) {
        return null;
    }

    const condition = payload.slice(0, lastClosingParenIndex + 1).trim();
    const statement = `${payload.slice(lastClosingParenIndex + 1).trim()};`;
    if (statement === ";") {
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

function isLogicalNotOperatorInContext(sourceText: string, index: number): boolean {
    const previousCharacter = index > 0 ? sourceText[index - 1] : null;
    if (previousCharacter && /[A-Za-z0-9_)\]]/u.test(previousCharacter)) {
        return false;
    }

    const tail = sourceText.slice(index + 1).trimStart();
    if (tail.length === 0) {
        return false;
    }

    const [nextCharacter] = tail;
    return (
        /[A-Za-z0-9_]/u.test(nextCharacter) ||
        nextCharacter === "(" ||
        nextCharacter === "'" ||
        nextCharacter === '"' ||
        nextCharacter === "[" ||
        nextCharacter === "-"
    );
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

        if (character === "&" && nextCharacter === "&") {
            rewritten.push("and");
            index += 2;
            continue;
        }

        if (character === "|" && nextCharacter === "|") {
            rewritten.push("or");
            index += 2;
            continue;
        }

        if (character === "^" && nextCharacter === "^") {
            rewritten.push("xor");
            index += 2;
            continue;
        }

        if (character === "!" && nextCharacter !== "=" && isLogicalNotOperatorInContext(sourceText, index)) {
            rewritten.push("not");
            if (nextCharacter !== undefined && !/\s/u.test(nextCharacter)) {
                rewritten.push(" ");
            }
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
            if (normalized === "and" || normalized === "or" || normalized === "xor" || normalized === "not") {
                rewritten.push(normalized);
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

function createRequireTrailingOptionalDefaultsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const functionPattern = /function\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([\s\S]*?)\)/g;
                    for (const match of text.matchAll(functionPattern)) {
                        const paramsStart = (match.index ?? 0) + match[0].indexOf("(") + 1;
                        const paramsEnd = paramsStart + match[1].length;
                        const paramsText = match[1];
                        const pieces = paramsText.split(",");
                        let sawDefault = false;
                        let changed = false;
                        const rewrittenPieces = pieces.map((piece) => {
                            const raw = piece;
                            const trimmed = piece.trim();
                            if (trimmed.length === 0) {
                                return raw;
                            }

                            if (trimmed.includes("=")) {
                                sawDefault = true;
                                return raw;
                            }

                            if (!sawDefault || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(trimmed)) {
                                return raw;
                            }

                            changed = true;
                            const leading = raw.slice(0, raw.indexOf(trimmed));
                            const trailing = raw.slice(raw.indexOf(trimmed) + trimmed.length);
                            return `${leading}${trimmed} = undefined${trailing}`;
                        });

                        if (!changed) {
                            continue;
                        }

                        const rewritten = rewrittenPieces.join(",");
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(paramsStart),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([paramsStart, paramsEnd], rewritten)
                        });
                    }
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
