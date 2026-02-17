import type { Rule } from "eslint";

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
                Program(node) {
                    const text = context.sourceCode.text;
                    const accessPattern = /array_length\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;
                    const counts = new Map<string, number>();
                    for (const match of text.matchAll(accessPattern)) {
                        const identifier = match[1];
                        counts.set(identifier, (counts.get(identifier) ?? 0) + 1);
                    }

                    for (const count of counts.values()) {
                        if (count >= minOccurrences) {
                            context.report({ node, messageId: definition.messageId });
                            break;
                        }
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
                        rewrittenLines.push(normalizeDocCommentPrefixLine(line));
                    }
                    flushDocBlock(pendingDocBlock);

                    const rewritten = rewrittenLines.join(lineEnding);
                    if (rewritten === text) {
                        return;
                    }

                    context.report({
                        loc: context.sourceCode.getLocFromIndex(0),
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
                    const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*\+\s*0\b/g;
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

function createRequireArgumentSeparatorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const shouldRepair = options.repair === undefined ? true : options.repair === true;

            return Object.freeze({
                Program(node) {
                    const text = context.sourceCode.text;
                    const callPattern = /\(([^)]*)\)/g;
                    for (const callMatch of text.matchAll(callPattern)) {
                        const payload = callMatch[1];
                        const payloadStart = (callMatch.index ?? 0) + 1;
                        const missingSeparator =
                            /([A-Za-z_][A-Za-z0-9_]*)(\s+\/\*[^*]*\*\/\s+|\s+)([A-Za-z_][A-Za-z0-9_]*)/.exec(payload);
                        if (!missingSeparator) {
                            continue;
                        }

                        const insertIndex = payloadStart + missingSeparator.index + missingSeparator[1].length;
                        context.report({
                            node,
                            messageId: definition.messageId,
                            fix: shouldRepair
                                ? (fixer) => {
                                      const insertion = missingSeparator[2].includes("\n")
                                          ? `,${dominantLineEnding(text)}`
                                          : ",";
                                      return fixer.insertTextAfterRange([insertIndex, insertIndex], insertion);
                                  }
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
