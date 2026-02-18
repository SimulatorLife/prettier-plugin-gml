import type { Rule } from "eslint";

import type { ProjectCapability, UnsafeReasonCode } from "../types/index.js";
import { createFeatherRule, featherManifest } from "./feather/index.js";
import { createGmlRule } from "./gml/index.js";
import { UNSAFE_REASON_CODES } from "./reason-codes.js";

export type GmlRuleDefinition = Readonly<{
    mapKey: `Gml${string}`;
    shortName: string;
    fullId: `gml/${string}`;
    messageId: string;
    schema: ReadonlyArray<unknown>;
    requiresProjectContext: boolean;
    requiredCapabilities: ReadonlyArray<ProjectCapability>;
    unsafeReasonCodes: ReadonlyArray<UnsafeReasonCode>;
}>;

const NO_CAPABILITIES = Object.freeze([]) as ReadonlyArray<ProjectCapability>;
const NO_REASON_CODES = Object.freeze([]) as ReadonlyArray<UnsafeReasonCode>;

export const gmlRuleDefinitions: ReadonlyArray<GmlRuleDefinition> = Object.freeze([
    {
        mapKey: "GmlPreferLoopLengthHoist",
        shortName: "prefer-loop-length-hoist",
        fullId: "gml/prefer-loop-length-hoist",
        messageId: "preferLoopLengthHoist",
        requiresProjectContext: true,
        requiredCapabilities: Object.freeze([
            "IDENTIFIER_OCCUPANCY",
            "LOOP_HOIST_NAME_RESOLUTION"
        ]) as ReadonlyArray<ProjectCapability>,
        unsafeReasonCodes: Object.freeze([
            UNSAFE_REASON_CODES.NAME_COLLISION,
            UNSAFE_REASON_CODES.CROSS_FILE_CONFLICT,
            UNSAFE_REASON_CODES.SEMANTIC_AMBIGUITY
        ]),
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
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
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
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlPreferStructLiteralAssignments",
        shortName: "prefer-struct-literal-assignments",
        fullId: "gml/prefer-struct-literal-assignments",
        messageId: "preferStructLiteralAssignments",
        requiresProjectContext: true,
        requiredCapabilities: Object.freeze([
            "IDENTIFIER_OCCURRENCES",
            "RENAME_CONFLICT_PLANNING"
        ]) as ReadonlyArray<ProjectCapability>,
        unsafeReasonCodes: Object.freeze([
            UNSAFE_REASON_CODES.SEMANTIC_AMBIGUITY,
            UNSAFE_REASON_CODES.CROSS_FILE_CONFLICT
        ]),
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
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
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
        requiresProjectContext: true,
        requiredCapabilities: Object.freeze([
            "IDENTIFIER_OCCUPANCY",
            "RENAME_CONFLICT_PLANNING"
        ]) as ReadonlyArray<ProjectCapability>,
        unsafeReasonCodes: Object.freeze([
            UNSAFE_REASON_CODES.NAME_COLLISION,
            UNSAFE_REASON_CODES.SEMANTIC_AMBIGUITY,
            UNSAFE_REASON_CODES.CROSS_FILE_CONFLICT
        ]),
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
        mapKey: "GmlNormalizeDocComments",
        shortName: "normalize-doc-comments",
        fullId: "gml/normalize-doc-comments",
        messageId: "normalizeDocComments",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlNormalizeDirectives",
        shortName: "normalize-directives",
        fullId: "gml/normalize-directives",
        messageId: "normalizeDirectives",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlRequireControlFlowBraces",
        shortName: "require-control-flow-braces",
        fullId: "gml/require-control-flow-braces",
        messageId: "requireControlFlowBraces",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlNoAssignmentInCondition",
        shortName: "no-assignment-in-condition",
        fullId: "gml/no-assignment-in-condition",
        messageId: "noAssignmentInCondition",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlPreferIsUndefinedCheck",
        shortName: "prefer-is-undefined-check",
        fullId: "gml/prefer-is-undefined-check",
        messageId: "preferIsUndefinedCheck",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlNormalizeOperatorAliases",
        shortName: "normalize-operator-aliases",
        fullId: "gml/normalize-operator-aliases",
        messageId: "normalizeOperatorAliases",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlPreferStringInterpolation",
        shortName: "prefer-string-interpolation",
        fullId: "gml/prefer-string-interpolation",
        messageId: "preferStringInterpolation",
        requiresProjectContext: true,
        requiredCapabilities: Object.freeze(["IDENTIFIER_OCCURRENCES"]) as ReadonlyArray<ProjectCapability>,
        unsafeReasonCodes: Object.freeze([
            UNSAFE_REASON_CODES.SEMANTIC_AMBIGUITY,
            UNSAFE_REASON_CODES.CROSS_FILE_CONFLICT
        ]),
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
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlRequireArgumentSeparators",
        shortName: "require-argument-separators",
        fullId: "gml/require-argument-separators",
        messageId: "requireArgumentSeparators",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([
            { type: "object", additionalProperties: false, properties: { repair: { type: "boolean", default: true } } }
        ])
    },
    {
        mapKey: "GmlNormalizeDataStructureAccessors",
        shortName: "normalize-data-structure-accessors",
        fullId: "gml/normalize-data-structure-accessors",
        messageId: "normalizeDataStructureAccessors",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        mapKey: "GmlRequireTrailingOptionalDefaults",
        shortName: "require-trailing-optional-defaults",
        fullId: "gml/require-trailing-optional-defaults",
        messageId: "requireTrailingOptionalDefaults",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
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

function createPluginRuleMap(): Record<string, Rule.RuleModule> {
    const map: Record<string, Rule.RuleModule> = {};
    for (const definition of gmlRuleDefinitions) {
        map[definition.shortName] = createGmlRule(definition);
    }
    for (const entry of featherManifest.entries) {
        const shortName = entry.ruleId.replace("feather/", "");
        map[shortName] = createFeatherRule(entry);
    }
    return map;
}

export const ruleIds = Object.freeze(createRuleIdMap());
export const lintRuleMap = Object.freeze(createPluginRuleMap());
