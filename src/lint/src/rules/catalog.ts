import type { Rule } from "eslint";

import { featherManifest } from "./feather/manifest.js";

export type GmlRuleDefinition = Readonly<{
    shortName: string;
    fullId: `gml/${string}`;
    messageId: string;
    schema: ReadonlyArray<unknown>;
}>;

const EMPTY_SCHEMA = Object.freeze([]) as ReadonlyArray<unknown>;

export const gmlRuleDefinitions: ReadonlyArray<GmlRuleDefinition> = Object.freeze([
    {
        shortName: "prefer-loop-length-hoist",
        fullId: "gml/prefer-loop-length-hoist",
        messageId: "preferLoopLengthHoist",
        schema: Object.freeze([
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    functionSuffixes: {
                        type: "object",
                        additionalProperties: {
                            anyOf: [{ type: "string", minLength: 1 }, { type: "null" }]
                        }
                    },
                    reportUnsafe: { type: "boolean", default: true }
                }
            }
        ])
    },
    {
        shortName: "prefer-hoistable-loop-accessors",
        fullId: "gml/prefer-hoistable-loop-accessors",
        messageId: "preferHoistableLoopAccessor",
        schema: Object.freeze([
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    minOccurrences: { type: "integer", minimum: 2, default: 2 },
                    reportUnsafe: { type: "boolean", default: true }
                }
            }
        ])
    },
    {
        shortName: "prefer-struct-literal-assignments",
        fullId: "gml/prefer-struct-literal-assignments",
        messageId: "preferStructLiteralAssignments",
        schema: Object.freeze([
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    reportUnsafe: { type: "boolean", default: true }
                }
            }
        ])
    },
    {
        shortName: "optimize-logical-flow",
        fullId: "gml/optimize-logical-flow",
        messageId: "optimizeLogicalFlow",
        schema: Object.freeze([
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    maxBooleanVariables: { type: "integer", minimum: 1, maximum: 10, default: 10 }
                }
            }
        ])
    },
    {
        shortName: "no-globalvar",
        fullId: "gml/no-globalvar",
        messageId: "noGlobalvar",
        schema: Object.freeze([
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    enableAutofix: { type: "boolean", default: true },
                    reportUnsafe: { type: "boolean", default: true }
                }
            }
        ])
    },
    {
        shortName: "normalize-doc-comments",
        fullId: "gml/normalize-doc-comments",
        messageId: "normalizeDocComments",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        shortName: "prefer-string-interpolation",
        fullId: "gml/prefer-string-interpolation",
        messageId: "preferStringInterpolation",
        schema: Object.freeze([
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    reportUnsafe: { type: "boolean", default: true }
                }
            }
        ])
    },
    {
        shortName: "optimize-math-expressions",
        fullId: "gml/optimize-math-expressions",
        messageId: "optimizeMathExpressions",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        shortName: "require-argument-separators",
        fullId: "gml/require-argument-separators",
        messageId: "requireArgumentSeparators",
        schema: Object.freeze([
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    repair: { type: "boolean", default: true }
                }
            }
        ])
    }
]);

function createNoopRule(messageId: string, schema: ReadonlyArray<unknown>): Rule.RuleModule {
    return Object.freeze({
        meta: Object.freeze({
            type: "suggestion",
            docs: Object.freeze({
                description: `Scaffold rule for ${messageId}.`,
                recommended: false,
                requiresProjectContext: false
            }),
            schema,
            messages: Object.freeze({
                [messageId]: `${messageId} diagnostic.`,
                unsafeFix: "[unsafe-fix:SEMANTIC_AMBIGUITY] Unsafe fix omitted.",
                missingProjectContext:
                    "Missing project context. Run via CLI with --project or disable this rule in direct ESLint usage."
            })
        }),
        create() {
            return Object.freeze({});
        }
    });
}

function createGmlRuleMap(): Record<string, Rule.RuleModule> {
    const map: Record<string, Rule.RuleModule> = {};
    for (const definition of gmlRuleDefinitions) {
        map[definition.shortName] = createNoopRule(definition.messageId, definition.schema);
    }
    return map;
}

function createFeatherRuleMap(): Record<string, Rule.RuleModule> {
    const map: Record<string, Rule.RuleModule> = {};
    for (const entry of featherManifest.entries) {
        const shortName = entry.ruleId.replace("feather/", "");
        map[shortName] = createNoopRule("diagnostic", EMPTY_SCHEMA);
    }
    return map;
}

export const gmlRuleMap = Object.freeze(createGmlRuleMap());
export const featherRuleMap = Object.freeze(createFeatherRuleMap());
