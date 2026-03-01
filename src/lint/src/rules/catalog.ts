import type { Rule } from "eslint";

import { createFeatherRule, featherManifest } from "./feather/index.js";
import { createGmlRule } from "./gml/index.js";

export type GmlRuleDefinition = Readonly<{
    mapKey: `Gml${string}`;
    shortName: string;
    fullId: `gml/${string}`;
    messageId: string;
    schema: ReadonlyArray<unknown>;
}>;

export const gmlRuleDefinitions: ReadonlyArray<GmlRuleDefinition> = Object.freeze([
    {
        mapKey: "GmlPreferLoopLengthHoist",
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
        mapKey: "GmlPreferHoistableLoopAccessors",
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
        mapKey: "GmlPreferRepeatLoops",
        shortName: "prefer-repeat-loops",
        fullId: "gml/prefer-repeat-loops",
        messageId: "preferRepeatLoops",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlPreferStructLiteralAssignments",
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
        mapKey: "GmlOptimizeLogicalFlow",
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
        mapKey: "GmlNoGlobalvar",
        shortName: "no-globalvar",
        fullId: "gml/no-globalvar",
        messageId: "noGlobalvar",
        schema: Object.freeze([
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    enableAutofix: { type: "boolean", default: true }
                }
            }
        ])
    },
    {
        mapKey: "GmlNormalizeDocComments",
        shortName: "normalize-doc-comments",
        fullId: "gml/normalize-doc-comments",
        messageId: "normalizeDocComments",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlNormalizeDirectives",
        shortName: "normalize-directives",
        fullId: "gml/normalize-directives",
        messageId: "normalizeDirectives",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlRequireControlFlowBraces",
        shortName: "require-control-flow-braces",
        fullId: "gml/require-control-flow-braces",
        messageId: "requireControlFlowBraces",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlNoAssignmentInCondition",
        shortName: "no-assignment-in-condition",
        fullId: "gml/no-assignment-in-condition",
        messageId: "noAssignmentInCondition",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlPreferIsUndefinedCheck",
        shortName: "prefer-is-undefined-check",
        fullId: "gml/prefer-is-undefined-check",
        messageId: "preferIsUndefinedCheck",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlPreferEpsilonComparisons",
        shortName: "prefer-epsilon-comparisons",
        fullId: "gml/prefer-epsilon-comparisons",
        messageId: "preferEpsilonComparisons",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlNormalizeOperatorAliases",
        shortName: "normalize-operator-aliases",
        fullId: "gml/normalize-operator-aliases",
        messageId: "normalizeOperatorAliases",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlPreferStringInterpolation",
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
        mapKey: "GmlOptimizeMathExpressions",
        shortName: "optimize-math-expressions",
        fullId: "gml/optimize-math-expressions",
        messageId: "optimizeMathExpressions",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlRequireArgumentSeparators",
        shortName: "require-argument-separators",
        fullId: "gml/require-argument-separators",
        messageId: "requireArgumentSeparators",
        schema: Object.freeze([
            { type: "object", additionalProperties: false, properties: { repair: { type: "boolean", default: true } } }
        ])
    },
    {
        mapKey: "GmlNormalizeDataStructureAccessors",
        shortName: "normalize-data-structure-accessors",
        fullId: "gml/normalize-data-structure-accessors",
        messageId: "normalizeDataStructureAccessors",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlRequireTrailingOptionalDefaults",
        shortName: "require-trailing-optional-defaults",
        fullId: "gml/require-trailing-optional-defaults",
        messageId: "requireTrailingOptionalDefaults",
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    }
]);

function toFeatherMapKey(ruleId: `feather/${string}`): `FeatherGM${string}` {
    const normalized = ruleId.replace("feather/gm", "");
    return `FeatherGM${normalized}`;
}

function createRuleIdMap(): Record<`Gml${string}` | `FeatherGM${string}`, `gml/${string}` | `feather/${string}`> {
    const map: Record<`Gml${string}` | `FeatherGM${string}`, `gml/${string}` | `feather/${string}`> = {};
    for (const definition of gmlRuleDefinitions) {
        map[definition.mapKey] = definition.fullId;
    }
    for (const entry of featherManifest.entries) {
        map[toFeatherMapKey(entry.ruleId)] = entry.ruleId;
    }
    return map;
}

function createGmlPluginRuleMap(): Record<string, Rule.RuleModule> {
    const map: Record<string, Rule.RuleModule> = {};
    for (const definition of gmlRuleDefinitions) {
        map[definition.shortName] = createGmlRule(definition);
    }
    return map;
}

function createFeatherPluginRuleMap(): Record<string, Rule.RuleModule> {
    const map: Record<string, Rule.RuleModule> = {};
    for (const entry of featherManifest.entries) {
        const shortName = entry.ruleId.replace("feather/", "");
        map[shortName] = createFeatherRule(entry);
    }
    return map;
}

export const ruleIds = Object.freeze(createRuleIdMap());
export const gmlLintRuleMap = Object.freeze(createGmlPluginRuleMap());
export const featherLintRuleMap = Object.freeze(createFeatherPluginRuleMap());
export const lintRuleMap = Object.freeze({
    ...gmlLintRuleMap,
    ...featherLintRuleMap
});
