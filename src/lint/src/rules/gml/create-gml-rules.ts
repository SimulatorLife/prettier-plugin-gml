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

function createPreferLoopLengthHoistRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const listener: Rule.RuleListener = {
                Program(node) {
                    const text = context.sourceCode.text;
                    const loopPattern = /for\s*\([^)]*array_length\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;
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

function createNormalizeDocCommentsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const pattern = /^\s*\/\/\/(\S)/gm;
                    for (const match of text.matchAll(pattern)) {
                        const start = (match.index ?? 0) + match[0].indexOf("///") + 3;
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(start),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.insertTextAfterRange([start, start], " ")
                        });
                    }

                    const legacyDocPattern = /^(\s*)\/\/\s*@([A-Za-z_][A-Za-z0-9_]*)/gm;
                    for (const match of text.matchAll(legacyDocPattern)) {
                        const start = match.index ?? 0;
                        const end = start + match[0].length;
                        const indentation = match[1] ?? "";
                        const tag = match[2] ?? "";
                        const normalized = `${indentation}/// @${tag}`;
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(start),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([start, end], normalized)
                        });
                    }
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

export function createGmlRule(definition: GmlRuleDefinition): Rule.RuleModule {
    switch (definition.shortName) {
        case "prefer-loop-length-hoist": {
            return createPreferLoopLengthHoistRule(definition);
        }
        case "prefer-hoistable-loop-accessors": {
            return createPreferHoistableLoopAccessorsRule(definition);
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
        default: {
            return Object.freeze({
                meta: createMeta(definition),
                create() {
                    return Object.freeze({});
                }
            });
        }
    }
}
