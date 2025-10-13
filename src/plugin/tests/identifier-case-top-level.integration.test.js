import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { buildProjectIndex } from "../../shared/project-index/index.js";
import {
    setIdentifierCaseDryRunContext,
    clearIdentifierCaseDryRunContexts
} from "../src/reporting/identifier-case-context.js";
import { COLLISION_CONFLICT_CODE } from "../src/identifier-case/common.js";
import {
    getIdentifierCaseOptionStore,
    clearIdentifierCaseOptionStore
} from "../src/identifier-case/option-store.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");
const fixturesDirectory = path.join(
    currentDirectory,
    "identifier-case-fixtures"
);

async function createTempProject({
    scriptFixtures = [
        { name: "sample_function", fixture: "top-level-scopes.gml" },
        { name: "sample_struct", fixture: "top-level-struct.gml" }
    ],
    eventFixture = "top-level-instance.gml"
} = {}) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gml-top-level-"));

    async function writeFile(relativePath, contents) {
        const absolutePath = path.join(tempRoot, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents, "utf8");
        return absolutePath;
    }

    await writeFile(
        "MyGame.yyp",
        JSON.stringify({ name: "MyGame", resourceType: "GMProject" })
    );

    const scripts = [];
    const scriptPaths = [];
    const scriptSources = [];

    for (const scriptConfig of scriptFixtures) {
        const scriptName = scriptConfig?.name ?? "script";
        const fixtureName = scriptConfig?.fixture ?? scriptConfig;
        await writeFile(
            `scripts/${scriptName}/${scriptName}.yy`,
            JSON.stringify({ resourceType: "GMScript", name: scriptName })
        );

        const scriptFixturePath = path.join(fixturesDirectory, fixtureName);
        const scriptSource = await fs.readFile(scriptFixturePath, "utf8");
        const scriptPath = await writeFile(
            `scripts/${scriptName}/${scriptName}.gml`,
            scriptSource
        );
        const scriptRecord = {
            name: scriptName,
            fixture: fixtureName,
            path: scriptPath,
            source: scriptSource
        };
        scripts.push(scriptRecord);
        scriptPaths.push(scriptPath);
        scriptSources.push(scriptSource);
    }

    let eventPath = null;
    let eventSource = null;
    if (eventFixture) {
        const eventFixturePath = path.join(fixturesDirectory, eventFixture);
        eventSource = await fs.readFile(eventFixturePath, "utf8");
        await writeFile(
            "objects/obj_scope/obj_scope.yy",
            JSON.stringify({
                resourceType: "GMObject",
                name: "obj_scope",
                eventList: [
                    {
                        resourceType: "GMEvent",
                        eventType: 0,
                        eventNum: 0,
                        eventContents: "objects/obj_scope/obj_scope_Create.gml"
                    }
                ]
            })
        );
        eventPath = await writeFile(
            "objects/obj_scope/obj_scope_Create.gml",
            eventSource
        );
    }

    const projectIndex = await buildProjectIndex(tempRoot);

    return {
        projectRoot: tempRoot,
        scripts,
        scriptPaths,
        scriptSources,
        event:
            eventPath && eventSource
                ? {
                    fixture: eventFixture,
                    path: eventPath,
                    source: eventSource
                }
                : null,
        eventPath,
        projectIndex
    };
}

describe("identifier case top-level renaming", () => {
    it("plans renames for top-level scopes without modifying sources during dry-run", async () => {
        const { projectRoot, scripts, event, projectIndex } =
            await createTempProject();

        try {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            const logger = { log() {} };
            const baseOptions = {
                plugins: [pluginPath],
                parser: "gml-parse",
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseFunctions: "camel",
                gmlIdentifierCaseStructs: "camel",
                gmlIdentifierCaseMacros: "camel",
                gmlIdentifierCaseInstance: "camel",
                gmlIdentifierCaseGlobals: "camel",
                gmlIdentifierCaseAssets: "off",
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: true,
                logger
            };

            const collectedPlans = [];

            for (const script of scripts) {
                setIdentifierCaseDryRunContext({
                    filepath: script.path,
                    projectIndex,
                    dryRun: true
                });

                const diagnostics = [];
                const options = {
                    ...baseOptions,
                    filepath: script.path,
                    diagnostics
                };

                const formatted = await prettier.format(script.source, options);

                if (script.fixture === "top-level-scopes.gml") {
                    assert.ok(
                        formatted.includes("sample_function"),
                        "Dry-run should keep the original function name"
                    );
                    assert.ok(!formatted.includes("sampleFunction"));
                    assert.ok(formatted.includes("new sample_struct"));
                    assert.ok(!formatted.includes("new sampleStruct"));
                    assert.ok(formatted.includes("MACRO_VALUE"));
                    assert.ok(!formatted.includes("macroValue"));
                    assert.ok(formatted.includes("global_value"));
                    assert.ok(!formatted.includes("globalValue"));
                } else if (script.fixture === "top-level-struct.gml") {
                    assert.ok(
                        formatted.includes("sample_struct"),
                        "Dry-run should keep constructor names"
                    );
                    assert.ok(!formatted.includes("sampleStruct"));
                }

                const store = getIdentifierCaseOptionStore(script.path);
                if (store?.__identifierCaseRenamePlan) {
                    collectedPlans.push(store.__identifierCaseRenamePlan);
                }
            }

            if (event) {
                setIdentifierCaseDryRunContext({
                    filepath: event.path,
                    projectIndex,
                    dryRun: true
                });

                const diagnostics = [];
                const eventOptions = {
                    ...baseOptions,
                    filepath: event.path,
                    diagnostics
                };

                const formattedEvent = await prettier.format(
                    event.source,
                    eventOptions
                );
                assert.ok(
                    formattedEvent.includes("instance_counter"),
                    "Dry-run should keep instance variables"
                );
                assert.ok(!formattedEvent.includes("instanceCounter"));

                const store = getIdentifierCaseOptionStore(event.path);
                if (store?.__identifierCaseRenamePlan) {
                    collectedPlans.push(store.__identifierCaseRenamePlan);
                }
            }

            const aggregatedOperations = collectedPlans.flatMap((plan) =>
                Array.isArray(plan?.operations) ? plan.operations : []
            );

            assert.ok(
                aggregatedOperations.length > 0,
                "Expected rename plan to be generated"
            );
            const operationScopes = new Set(
                aggregatedOperations.map(
                    (operation) => operation.id?.split(":")[0]
                )
            );
            assert.ok(operationScopes.has("functions"));
            assert.ok(operationScopes.has("structs"));
            assert.ok(operationScopes.has("macros"));
            assert.ok(operationScopes.has("globals"));
            assert.ok(operationScopes.has("instance"));
        } finally {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    it("applies top-level renames when write mode is enabled", async () => {
        const { projectRoot, scripts, event, projectIndex } =
            await createTempProject();

        try {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            const baseOptions = {
                plugins: [pluginPath],
                parser: "gml-parse",
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseFunctions: "camel",
                gmlIdentifierCaseStructs: "camel",
                gmlIdentifierCaseMacros: "camel",
                gmlIdentifierCaseInstance: "camel",
                gmlIdentifierCaseGlobals: "camel",
                gmlIdentifierCaseAssets: "off",
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: false
            };

            for (const script of scripts) {
                setIdentifierCaseDryRunContext({
                    filepath: script.path,
                    projectIndex,
                    dryRun: false
                });

                const diagnostics = [];
                const options = {
                    ...baseOptions,
                    filepath: script.path,
                    diagnostics
                };

                const rewritten = await prettier.format(script.source, options);

                if (script.fixture === "top-level-scopes.gml") {
                    assert.ok(
                        rewritten.includes("sampleFunction"),
                        "Function call should be rewritten"
                    );
                    assert.ok(!rewritten.includes("sample_function("));
                    assert.ok(
                        rewritten.includes("function sampleFunction"),
                        "Function declaration should be rewritten"
                    );
                    assert.ok(
                        !rewritten.includes("function sample_function("),
                        "Original function declaration should not remain"
                    );
                    assert.ok(rewritten.includes("macroValue"));
                    assert.ok(!rewritten.includes("MACRO_VALUE"));
                    assert.ok(rewritten.includes("global.globalValue"));
                    assert.ok(!rewritten.includes("global_value ="));
                    assert.ok(rewritten.includes("functionResult"));
                    assert.ok(!rewritten.includes("function_result"));
                    assert.ok(rewritten.includes("new sampleStruct"));
                    assert.ok(!rewritten.includes("new sample_struct"));
                } else if (script.fixture === "top-level-struct.gml") {
                    assert.ok(
                        rewritten.includes("function sampleStruct"),
                        "Struct constructor declaration should be rewritten"
                    );
                    assert.ok(
                        !rewritten.includes("function sample_struct("),
                        "Original struct constructor should not remain"
                    );
                }
            }

            if (event) {
                setIdentifierCaseDryRunContext({
                    filepath: event.path,
                    projectIndex,
                    dryRun: false
                });

                const diagnostics = [];
                const eventOptions = {
                    ...baseOptions,
                    filepath: event.path,
                    diagnostics
                };
                const rewrittenEvent = await prettier.format(
                    event.source,
                    eventOptions
                );
                assert.ok(
                    rewrittenEvent.includes("instanceCounter"),
                    "Instance variable should be rewritten"
                );
                assert.ok(!rewrittenEvent.includes("instance_counter"));
            }
        } finally {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    it("reports cross-scope collisions before applying renames", async () => {
        const { projectRoot, scripts, projectIndex } = await createTempProject({
            scriptFixtures: [
                {
                    name: "collision_script",
                    fixture: "top-level-collisions.gml"
                }
            ],
            eventFixture: null
        });

        const script = scripts[0];

        try {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            setIdentifierCaseDryRunContext({
                filepath: script.path,
                projectIndex,
                dryRun: true
            });

            const diagnostics = [];
            const formatOptions = {
                plugins: [pluginPath],
                parser: "gml-parse",
                filepath: script.path,
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseFunctions: "camel",
                gmlIdentifierCaseGlobals: "camel",
                gmlIdentifierCaseAssets: "off",
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: true,
                diagnostics
            };

            const formatted = await prettier.format(
                script.source,
                formatOptions
            );
            assert.ok(
                formatted.includes("function global_value"),
                "Collisions should prevent rewriting"
            );
            assert.ok(formatted.includes("globalValue"));
            assert.ok(!formatted.includes("function globalValue"));

            const store = getIdentifierCaseOptionStore(script.path);
            const conflicts = store?.__identifierCaseConflicts ?? [];
            assert.ok(conflicts.length > 0, "Expected collision conflict");
            const collision = conflicts.find(
                (entry) => entry.code === COLLISION_CONFLICT_CODE
            );
            assert.ok(collision, "Expected collision conflict to be reported");
            assert.match(collision.message, /global variable/i);
        } finally {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});
