import type { Rule } from "eslint";

import type { ProjectCapability, UnsafeReasonCode } from "../types/index.js";
import { featherManifest } from "./feather/manifest.js";
import { reportMissingProjectContextOncePerFile, resolveProjectContextForRule } from "./project-context.js";
import {
    RESERVED_MISSING_PROJECT_CONTEXT_REASON_CODE,
    UNSAFE_REASON_CODE_REGISTRY,
    UNSAFE_REASON_CODES
} from "./reason-codes.js";

export type GmlRuleDefinition = Readonly<{
    shortName: string;
    fullId: `gml/${string}`;
    messageId: string;
    schema: ReadonlyArray<unknown>;
    requiresProjectContext: boolean;
    requiredCapabilities: ReadonlyArray<ProjectCapability>;
    unsafeReasonCodes: ReadonlyArray<UnsafeReasonCode>;
}>;

type RuleDocs = Readonly<{
    description: string;
    recommended: false;
    requiresProjectContext: boolean;
    gml?: Readonly<{
        requiredCapabilities: ReadonlyArray<ProjectCapability>;
        unsafeReasonCodes: ReadonlyArray<UnsafeReasonCode>;
    }>;
}>;

type RuleMessages = Readonly<Record<string, string>>;

const EMPTY_SCHEMA = Object.freeze([]) as ReadonlyArray<unknown>;
const NO_CAPABILITIES = Object.freeze([]) as ReadonlyArray<ProjectCapability>;
const NO_REASON_CODES = Object.freeze([]) as ReadonlyArray<UnsafeReasonCode>;

const MISSING_PROJECT_CONTEXT_MESSAGE =
    "Missing project context. Run via CLI with --project or disable this rule in direct ESLint usage.";
const UNSAFE_FIX_MESSAGE_ID = "unsafeFix";
const MISSING_PROJECT_CONTEXT_MESSAGE_ID = "missingProjectContext";

export const gmlRuleDefinitions: ReadonlyArray<GmlRuleDefinition> = Object.freeze([
    {
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
        shortName: "normalize-doc-comments",
        fullId: "gml/normalize-doc-comments",
        messageId: "normalizeDocComments",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        shortName: "prefer-string-interpolation",
        fullId: "gml/prefer-string-interpolation",
        messageId: "preferStringInterpolation",
        requiresProjectContext: true,
        requiredCapabilities: Object.freeze(["IDENTIFIER_OCCURRENCES"]) as ReadonlyArray<ProjectCapability>,
        unsafeReasonCodes: Object.freeze([
            UNSAFE_REASON_CODES.NON_IDEMPOTENT_EXPRESSION,
            UNSAFE_REASON_CODES.SEMANTIC_AMBIGUITY
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
        shortName: "optimize-math-expressions",
        fullId: "gml/optimize-math-expressions",
        messageId: "optimizeMathExpressions",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
        schema: Object.freeze([{ type: "object", additionalProperties: false, properties: {} }])
    },
    {
        shortName: "require-argument-separators",
        fullId: "gml/require-argument-separators",
        messageId: "requireArgumentSeparators",
        requiresProjectContext: false,
        requiredCapabilities: NO_CAPABILITIES,
        unsafeReasonCodes: NO_REASON_CODES,
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

function createRuleDocs(definition: GmlRuleDefinition): RuleDocs {
    if (!definition.requiresProjectContext) {
        return Object.freeze({
            description: `Scaffold rule for ${definition.messageId}.`,
            recommended: false,
            requiresProjectContext: false
        });
    }

    return Object.freeze({
        description: `Scaffold rule for ${definition.messageId}.`,
        recommended: false,
        requiresProjectContext: true,
        gml: Object.freeze({
            requiredCapabilities: definition.requiredCapabilities,
            unsafeReasonCodes: definition.unsafeReasonCodes
        })
    });
}

function createRuleMessages(definition: GmlRuleDefinition): RuleMessages {
    const messages: Record<string, string> = {
        [definition.messageId]: `${definition.messageId} diagnostic.`
    };

    if (definition.unsafeReasonCodes.length > 0) {
        messages[UNSAFE_FIX_MESSAGE_ID] = `[unsafe-fix:${definition.unsafeReasonCodes[0]}] Unsafe fix omitted.`;
    }

    if (definition.requiresProjectContext) {
        messages[MISSING_PROJECT_CONTEXT_MESSAGE_ID] = MISSING_PROJECT_CONTEXT_MESSAGE;
    }

    return Object.freeze(messages);
}

function getUnsafeFixReasonCodes(messages: RuleMessages): ReadonlySet<UnsafeReasonCode> {
    const emittedReasonCodes = new Set<UnsafeReasonCode>();
    for (const message of Object.values(messages)) {
        const match = /^\[unsafe-fix:(?<reasonCode>[A-Z_]+)]/.exec(message);
        if (!match) {
            continue;
        }

        const reasonCode = match.groups?.reasonCode as UnsafeReasonCode;
        emittedReasonCodes.add(reasonCode);
    }

    return emittedReasonCodes;
}

function assertKnownDeclaredReasonCodes(
    definition: GmlRuleDefinition,
    declaredReasonCodes: ReadonlySet<UnsafeReasonCode>
): void {
    for (const reasonCode of declaredReasonCodes) {
        if (!UNSAFE_REASON_CODE_REGISTRY.has(reasonCode)) {
            throw new Error(`${definition.fullId} declares unknown unsafe reason code: ${reasonCode}`);
        }

        if (reasonCode === RESERVED_MISSING_PROJECT_CONTEXT_REASON_CODE) {
            throw new Error(
                `${definition.fullId} must not declare ${RESERVED_MISSING_PROJECT_CONTEXT_REASON_CODE} in meta.docs.gml.unsafeReasonCodes`
            );
        }
    }
}

function assertKnownEmittedReasonCodes(
    definition: GmlRuleDefinition,
    declaredReasonCodes: ReadonlySet<UnsafeReasonCode>,
    emittedReasonCodes: ReadonlySet<UnsafeReasonCode>
): void {
    for (const reasonCode of emittedReasonCodes) {
        if (!UNSAFE_REASON_CODE_REGISTRY.has(reasonCode)) {
            throw new Error(`${definition.fullId} emits unknown unsafe reason code: ${reasonCode}`);
        }

        if (!declaredReasonCodes.has(reasonCode)) {
            throw new Error(
                `${definition.fullId} emits unsafe reason code not declared in meta.docs.gml.unsafeReasonCodes: ${reasonCode}`
            );
        }

        if (reasonCode === RESERVED_MISSING_PROJECT_CONTEXT_REASON_CODE) {
            throw new Error(
                `${definition.fullId} must not emit ${RESERVED_MISSING_PROJECT_CONTEXT_REASON_CODE} from unsafeFix diagnostics`
            );
        }
    }
}

function assertMutuallyExclusiveMissingProjectContextAndUnsafeFix(
    definition: GmlRuleDefinition,
    messages: RuleMessages
): void {
    if (!(MISSING_PROJECT_CONTEXT_MESSAGE_ID in messages) || !(UNSAFE_FIX_MESSAGE_ID in messages)) {
        return;
    }

    const unsafeFixReasonCodes = getUnsafeFixReasonCodes({ [UNSAFE_FIX_MESSAGE_ID]: messages[UNSAFE_FIX_MESSAGE_ID] });
    if (unsafeFixReasonCodes.has(RESERVED_MISSING_PROJECT_CONTEXT_REASON_CODE)) {
        throw new Error(
            `${definition.fullId} cannot emit both missingProjectContext and unsafeFix:${RESERVED_MISSING_PROJECT_CONTEXT_REASON_CODE}`
        );
    }
}

function validateReasonCodeRegistry(definition: GmlRuleDefinition, messages: RuleMessages): void {
    const declaredReasonCodes = new Set(definition.unsafeReasonCodes);
    const emittedReasonCodes = getUnsafeFixReasonCodes(messages);

    assertKnownDeclaredReasonCodes(definition, declaredReasonCodes);
    assertKnownEmittedReasonCodes(definition, declaredReasonCodes, emittedReasonCodes);
    assertMutuallyExclusiveMissingProjectContextAndUnsafeFix(definition, messages);
}

function createNoopRule(definition: GmlRuleDefinition): Rule.RuleModule {
    const docs = createRuleDocs(definition);
    const messages = createRuleMessages(definition);
    validateReasonCodeRegistry(definition, messages);

    return Object.freeze({
        meta: Object.freeze({
            type: "suggestion",
            docs,
            schema: definition.schema,
            messages
        }),
        create(context: Rule.RuleContext) {
            if (!definition.requiresProjectContext) {
                return Object.freeze({});
            }

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

function createGmlRuleMap(): Record<string, Rule.RuleModule> {
    const map: Record<string, Rule.RuleModule> = {};
    for (const definition of gmlRuleDefinitions) {
        map[definition.shortName] = createNoopRule(definition);
    }
    return map;
}

function createFeatherRuleMap(): Record<string, Rule.RuleModule> {
    const map: Record<string, Rule.RuleModule> = {};
    for (const entry of featherManifest.entries) {
        const shortName = entry.ruleId.replace("feather/", "");
        map[shortName] = Object.freeze({
            meta: Object.freeze({
                type: "suggestion",
                docs: Object.freeze({
                    description: `Scaffold rule for ${entry.ruleId}.`,
                    recommended: false,
                    requiresProjectContext: entry.requiresProjectContext
                }),
                schema: EMPTY_SCHEMA,
                messages: Object.freeze({
                    diagnostic: `${entry.ruleId} diagnostic.`
                })
            }),
            create() {
                return Object.freeze({});
            }
        });
    }
    return map;
}

export const gmlRuleMap = Object.freeze(createGmlRuleMap());
export const featherRuleMap = Object.freeze(createFeatherRuleMap());
