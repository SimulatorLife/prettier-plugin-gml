import type { Rule } from "eslint";

import type { ProjectCapability, UnsafeReasonCode } from "../types/index.js";
import { featherManifest } from "./feather/manifest.js";
import { reportMissingProjectContextOncePerFile, resolveProjectContextForRule } from "./project-context.js";
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

const EMPTY_SCHEMA = Object.freeze([]) as ReadonlyArray<unknown>;
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
        unsafeReasonCodes: Object.freeze([UNSAFE_REASON_CODES.NAME_COLLISION, UNSAFE_REASON_CODES.CROSS_FILE_CONFLICT]),
        schema: EMPTY_SCHEMA
    },
    {
        mapKey: "GmlNormalizeDocComments",
        shortName: "normalize-doc-comments",
        fullId: "gml/normalize-doc-comments",
        messageId: "normalizeDocComments",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: EMPTY_SCHEMA
    },
    {
        mapKey: "GmlPreferStringInterpolation",
        shortName: "prefer-string-interpolation",
        fullId: "gml/prefer-string-interpolation",
        messageId: "preferStringInterpolation",
        requiresProjectContext: true,
        requiredCapabilities: Object.freeze([
            "IDENTIFIER_OCCUPANCY",
            "STRING_LITERAL_REWRITE"
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
                    preferTemplateTag: { type: "boolean", default: false }
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
        schema: EMPTY_SCHEMA
    },
    {
        mapKey: "GmlRequireArgumentSeparators",
        shortName: "require-argument-separators",
        fullId: "gml/require-argument-separators",
        messageId: "requireArgumentSeparators",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: EMPTY_SCHEMA
    }
]);

function createNoopRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: Object.freeze({
            type: "suggestion",
            docs: Object.freeze({
                description: `Scaffold rule for ${definition.fullId}.`,
                recommended: false,
                requiresProjectContext: definition.requiresProjectContext,
                gml: Object.freeze({
                    requiredCapabilities: definition.requiredCapabilities,
                    unsafeReasonCodes: definition.unsafeReasonCodes
                })
            }),
            schema: definition.schema,
            messages: Object.freeze({
                [definition.messageId]: `${definition.fullId} diagnostic.`,
                unsafeFix: "[unsafe-fix:SEMANTIC_AMBIGUITY] Unsafe fix omitted.",
                missingProjectContext:
                    "Missing project context. Run via CLI with --project or disable this rule in direct ESLint usage."
            })
        }),
        create(context: Rule.RuleContext) {
            const projectContext = resolveProjectContextForRule(context, {
                requiresProjectContext: definition.requiresProjectContext,
                requiredCapabilities: definition.requiredCapabilities
            });
            if (projectContext.available) {
                return Object.freeze({});
            }

            return reportMissingProjectContextOncePerFile(context, Object.freeze({}));
        }
    });
}

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
        map[definition.shortName] = createNoopRule(definition);
    }
    for (const entry of featherManifest.entries) {
        const shortName = entry.ruleId.replace("feather/", "");
        map[shortName] = Object.freeze({
            meta: Object.freeze({
                type: "suggestion",
                docs: Object.freeze({
                    description: `Scaffold rule for ${entry.ruleId}.`,
                    recommended: false,
                    requiresProjectContext: entry.requiresProjectContext,
                    gml: Object.freeze({
                        requiredCapabilities: Object.freeze([]),
                        unsafeReasonCodes: Object.freeze([] as ReadonlyArray<UnsafeReasonCode>)
                    })
                }),
                schema: EMPTY_SCHEMA,
                messages: Object.freeze({
                    diagnostic: `${entry.ruleId} diagnostic.`,
                    unsafeFix: "[unsafe-fix:SEMANTIC_AMBIGUITY] Unsafe fix omitted.",
                    missingProjectContext:
                        "Missing project context. Run via CLI with --project or disable this rule in direct ESLint usage."
                })
            }),
            create(context: Rule.RuleContext) {
                void context;
                return Object.freeze({});
            }
        });
    }
    return map;
}

export const ruleIds = Object.freeze(createRuleIdMap());
export const lintRuleMap = Object.freeze(createPluginRuleMap());
