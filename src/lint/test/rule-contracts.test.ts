import assert from "node:assert/strict";
import { test } from "node:test";

import { Lint } from "@gml-modules/lint";

const expectedRules = Object.freeze([
    {
        shortName: "prefer-loop-length-hoist",
        messageId: "preferLoopLengthHoist",
        schema: [
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
        ]
    },
    {
        shortName: "prefer-hoistable-loop-accessors",
        messageId: "preferHoistableLoopAccessor",
        schema: [
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    minOccurrences: { type: "integer", minimum: 2, default: 2 },
                    reportUnsafe: { type: "boolean", default: true }
                }
            }
        ]
    },
    {
        shortName: "prefer-struct-literal-assignments",
        messageId: "preferStructLiteralAssignments",
        schema: [
            {
                type: "object",
                additionalProperties: false,
                properties: { reportUnsafe: { type: "boolean", default: true } }
            }
        ]
    },
    {
        shortName: "optimize-logical-flow",
        messageId: "optimizeLogicalFlow",
        schema: [
            {
                type: "object",
                additionalProperties: false,
                properties: { maxBooleanVariables: { type: "integer", minimum: 1, maximum: 10, default: 10 } }
            }
        ]
    },
    {
        shortName: "no-globalvar",
        messageId: "noGlobalvar",
        schema: [
            {
                type: "object",
                additionalProperties: false,
                properties: {
                    enableAutofix: { type: "boolean", default: true },
                    reportUnsafe: { type: "boolean", default: true }
                }
            }
        ]
    },
    {
        shortName: "normalize-doc-comments",
        messageId: "normalizeDocComments",
        schema: [{ type: "object", additionalProperties: false, properties: {} }]
    },
    {
        shortName: "prefer-string-interpolation",
        messageId: "preferStringInterpolation",
        schema: [
            {
                type: "object",
                additionalProperties: false,
                properties: { reportUnsafe: { type: "boolean", default: true } }
            }
        ]
    },
    {
        shortName: "optimize-math-expressions",
        messageId: "optimizeMathExpressions",
        schema: [{ type: "object", additionalProperties: false, properties: {} }]
    },
    {
        shortName: "require-argument-separators",
        messageId: "requireArgumentSeparators",
        schema: [
            { type: "object", additionalProperties: false, properties: { repair: { type: "boolean", default: true } } }
        ]
    }
]);

void test("recommended baseline rules expose stable messageIds and exact schemas", () => {
    for (const ruleDefinition of expectedRules) {
        const rule = Lint.plugin.rules[ruleDefinition.shortName] as {
            meta?: { messages?: Record<string, string>; schema?: ReadonlyArray<unknown> };
        };

        assert.equal(typeof rule.meta?.messages?.[ruleDefinition.messageId], "string");
        assert.deepEqual(rule.meta?.schema, ruleDefinition.schema);
    }
});

void test("project-aware rules declare required capabilities and unsafe reason codes", () => {
    const projectAwareRuleIds = [
        "prefer-loop-length-hoist",
        "prefer-struct-literal-assignments",
        "no-globalvar",
        "prefer-string-interpolation"
    ];

    for (const ruleId of projectAwareRuleIds) {
        const rule = Lint.plugin.rules[ruleId] as unknown as { meta?: { docs?: Record<string, unknown> } };
        const docs = rule.meta?.docs;
        const gmlDocs = docs.gml as Record<string, unknown>;
        assert.equal(docs.requiresProjectContext, true, `${ruleId} should be project-aware`);
        assert.ok(Array.isArray(gmlDocs.requiredCapabilities), `${ruleId} must declare requiredCapabilities`);
        assert.ok(Array.isArray(gmlDocs.unsafeReasonCodes), `${ruleId} must declare unsafeReasonCodes`);
    }
});

void test("project-aware rules report missing context once per file", () => {
    const rule = Lint.plugin.rules["prefer-loop-length-hoist"] as {
        create: (context: {
            options: Array<unknown>;
            settings: Record<string, unknown>;
            sourceCode: { parserServices: Record<string, unknown> };
            report: (payload: { messageId: string }) => void;
        }) => { Program?: (node: { type: string }) => void };
    };

    const reported: Array<string> = [];
    const listeners = rule.create({
        options: [{}],
        settings: {},
        sourceCode: { parserServices: {} },
        report: (payload) => {
            reported.push(payload.messageId);
        }
    });

    listeners.Program?.({ type: "Program" });
    listeners.Program?.({ type: "Program" });
    assert.deepEqual(reported, ["missingProjectContext"]);
});
