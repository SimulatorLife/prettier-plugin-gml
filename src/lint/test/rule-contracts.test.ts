import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

type RuleMeta = Readonly<{
    docs: Readonly<Record<string, unknown>>;
    messages: Readonly<Record<string, string>>;
    schema: ReadonlyArray<unknown>;
    fixable?: "code" | "whitespace";
}>;

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
        shortName: "prefer-repeat-loops",
        messageId: "preferRepeatLoops",
        schema: [{ type: "object", additionalProperties: false, properties: {} }]
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
        shortName: "normalize-directives",
        messageId: "normalizeDirectives",
        schema: [{ type: "object", additionalProperties: false, properties: {} }]
    },
    {
        shortName: "require-control-flow-braces",
        messageId: "requireControlFlowBraces",
        schema: [{ type: "object", additionalProperties: false, properties: {} }]
    },
    {
        shortName: "no-assignment-in-condition",
        messageId: "noAssignmentInCondition",
        schema: [{ type: "object", additionalProperties: false, properties: {} }]
    },
    {
        shortName: "normalize-operator-aliases",
        messageId: "normalizeOperatorAliases",
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
    },
    {
        shortName: "normalize-data-structure-accessors",
        messageId: "normalizeDataStructureAccessors",
        schema: [{ type: "object", additionalProperties: false, properties: {} }]
    },
    {
        shortName: "require-trailing-optional-defaults",
        messageId: "requireTrailingOptionalDefaults",
        schema: [{ type: "object", additionalProperties: false, properties: {} }]
    }
]);

function getRuleMeta(ruleId: string): RuleMeta {
    const rule = LintWorkspace.Lint.plugin.rules[ruleId] as unknown as { meta: RuleMeta };
    return rule.meta;
}

function extractUnsafeFixReasonCodes(messages: Readonly<Record<string, string>>): ReadonlySet<string> {
    const reasonCodes = new Set<string>();
    for (const message of Object.values(messages)) {
        const match = /^\[unsafe-fix:(?<reasonCode>[A-Z_]+)]/.exec(message);
        if (!match?.groups?.reasonCode) {
            continue;
        }

        reasonCodes.add(match.groups.reasonCode);
    }

    return reasonCodes;
}

function resolveSourceRoot(testDirectory: string): string {
    const candidates = [path.resolve(testDirectory, "../src"), path.resolve(testDirectory, "../../src")];
    const resolved = candidates.find((candidate) => existsSync(path.join(candidate, "language/recovery.ts")));
    if (!resolved) {
        throw new Error(`Unable to resolve lint source root from ${testDirectory}`);
    }

    return resolved;
}

void test("recommended baseline rules expose stable messageIds and exact schemas", () => {
    for (const ruleDefinition of expectedRules) {
        const rule = LintWorkspace.Lint.plugin.rules[ruleDefinition.shortName] as {
            meta?: { messages?: Record<string, string>; schema?: ReadonlyArray<unknown>; fixable?: string };
        };

        assert.equal(typeof rule.meta?.messages?.[ruleDefinition.messageId], "string");
        assert.deepEqual(rule.meta?.schema, ruleDefinition.schema);
        assert.equal(rule.meta?.fixable, "code");
    }
});

void test("feather rules declare fixable metadata for autofix reports", () => {
    for (const ruleId of Object.values(LintWorkspace.Lint.ruleIds)) {
        if (!ruleId.startsWith("feather/")) {
            continue;
        }

        const shortName = ruleId.replace("feather/", "");
        const rule = LintWorkspace.Lint.plugin.rules[shortName] as { meta?: { fixable?: string } };
        assert.equal(rule.meta?.fixable, "code", `${ruleId} must set meta.fixable to 'code'`);
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
        const { docs, messages } = getRuleMeta(ruleId);
        const gmlDocs = docs.gml as Readonly<Record<string, unknown>>;

        assert.equal(docs.requiresProjectContext, true, `${ruleId} should be project-aware`);
        assert.ok(Array.isArray(gmlDocs.requiredCapabilities), `${ruleId} must declare requiredCapabilities`);
        assert.ok(Array.isArray(gmlDocs.unsafeReasonCodes), `${ruleId} must declare unsafeReasonCodes`);
        assert.ok(messages.missingProjectContext, `${ruleId} must declare missingProjectContext message`);

        const declaredReasonCodes = new Set(gmlDocs.unsafeReasonCodes as ReadonlyArray<string>);
        const emittedReasonCodes = extractUnsafeFixReasonCodes(messages);
        for (const reasonCode of emittedReasonCodes) {
            assert.equal(
                declaredReasonCodes.has(reasonCode),
                true,
                `${ruleId} must declare emitted unsafe-fix reason code ${reasonCode}`
            );
            assert.equal(
                [
                    "MISSING_PROJECT_CONTEXT",
                    "NAME_COLLISION",
                    "CROSS_FILE_CONFLICT",
                    "SEMANTIC_AMBIGUITY",
                    "NON_IDEMPOTENT_EXPRESSION"
                ].includes(reasonCode),
                true,
                `${ruleId} emitted unknown unsafe-fix reason code ${reasonCode}`
            );
            assert.notEqual(
                reasonCode,
                "MISSING_PROJECT_CONTEXT",
                `${ruleId} must not emit reserved reason code MISSING_PROJECT_CONTEXT via unsafeFix`
            );
        }
    }
});

void test("non-project-aware rules do not expose gml project metadata", () => {
    const nonProjectAwareRuleIds = [
        "prefer-hoistable-loop-accessors",
        "prefer-repeat-loops",
        "optimize-logical-flow",
        "normalize-doc-comments",
        "normalize-directives",
        "require-control-flow-braces",
        "no-assignment-in-condition",
        "normalize-operator-aliases",
        "optimize-math-expressions",
        "require-argument-separators",
        "normalize-data-structure-accessors",
        "require-trailing-optional-defaults"
    ];

    for (const ruleId of nonProjectAwareRuleIds) {
        const { docs, messages } = getRuleMeta(ruleId);
        assert.equal(docs.requiresProjectContext, false, `${ruleId} should not require project context`);
        assert.equal("gml" in docs, false, `${ruleId} should not declare docs.gml metadata`);
        assert.equal(
            "missingProjectContext" in messages,
            false,
            `${ruleId} should not declare missingProjectContext message`
        );
    }
});

void test("project-aware rules report missingProjectContext at most once per file", () => {
    const ruleModule = LintWorkspace.Lint.plugin.rules["no-globalvar"];
    const reported: Array<string> = [];
    const listeners = ruleModule.create({
        settings: Object.freeze({}),
        sourceCode: { parserServices: { gml: { filePath: "sample.gml" } } },
        report: (payload: { messageId: string }) => {
            reported.push(payload.messageId);
        }
    } as never);

    listeners.Program?.({ type: "Program" } as never);
    listeners.Program?.({ type: "Program" } as never);
    listeners.Program?.({ type: "Program" } as never);
    listeners.Program?.({ type: "Program" } as never);
    assert.deepEqual(reported, ["missingProjectContext"]);
});

void test("all registered lint rules return non-empty listeners (no silent placeholder rules)", () => {
    const allCapabilities = new Set([
        "IDENTIFIER_OCCUPANCY",
        "IDENTIFIER_OCCURRENCES",
        "LOOP_HOIST_NAME_RESOLUTION",
        "RENAME_CONFLICT_PLANNING"
    ]);

    for (const [ruleShortName, ruleModule] of Object.entries(LintWorkspace.Lint.plugin.rules)) {
        const listeners = ruleModule.create({
            options: [{}],
            settings: {
                gml: {
                    project: {
                        getContext: () => ({ capabilities: allCapabilities })
                    }
                }
            },
            sourceCode: {
                text: "var value = 1;\n",
                parserServices: {
                    gml: {
                        filePath: "sample.gml"
                    }
                },
                getLocFromIndex: () => ({ line: 1, column: 0 })
            },
            report: () => undefined
        } as never);

        assert.equal(
            Object.keys(listeners).length > 0,
            true,
            `${ruleShortName} unexpectedly returned an empty listener object`
        );
    }
});

void test("only gml/require-argument-separators may consume inserted separator recovery metadata", () => {
    assert.ok(
        LintWorkspace.Lint.ruleIds.GmlRequireArgumentSeparators,
        "Expected require-argument-separators rule id to exist."
    );

    const testDirectory = path.dirname(fileURLToPath(import.meta.url));
    const sourceRoot = resolveSourceRoot(testDirectory);
    const rulesDirectory = path.join(sourceRoot, "rules");
    const recoveryDirectory = path.join(sourceRoot, "language");

    const recoveryModulePath = path.join(recoveryDirectory, "recovery.ts");
    const recoveryModuleSource = readFileSync(recoveryModulePath, "utf8");
    assert.equal(
        recoveryModuleSource.includes("INSERTED_ARGUMENT_SEPARATOR_KIND"),
        true,
        "Expected recovery contract constant to exist."
    );

    const queue = [rulesDirectory];
    const ruleSourceFilePaths: Array<string> = [];
    while (queue.length > 0) {
        const currentDirectory = queue.pop();
        if (!currentDirectory) {
            continue;
        }

        for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
            const entryPath = path.join(currentDirectory, entry.name);
            if (entry.isDirectory()) {
                queue.push(entryPath);
                continue;
            }

            if (entry.isFile() && entry.name.endsWith(".ts")) {
                ruleSourceFilePaths.push(entryPath);
            }
        }
    }

    const forbiddenReferences = ruleSourceFilePaths.filter((filePath) => {
        const source = readFileSync(filePath, "utf8");
        return (
            source.includes("INSERTED_ARGUMENT_SEPARATOR_KIND") ||
            source.includes("inserted-argument-separator") ||
            source.includes("InsertedArgumentSeparatorRecovery")
        );
    });

    assert.deepEqual(
        forbiddenReferences,
        [],
        "Recovery separator metadata must remain language-owned and not be consumed directly by unrelated rules."
    );
});
