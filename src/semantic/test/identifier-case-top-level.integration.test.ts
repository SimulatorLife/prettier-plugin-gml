import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
    clearIdentifierCaseDryRunContexts,
    setIdentifierCaseDryRunContext
} from "../src/identifier-case/identifier-case-context.js";
import { clearIdentifierCaseOptionStore, getIdentifierCaseOptionStore } from "../src/identifier-case/option-store.js";
import { getFormat } from "./format-loader.js";
import { createIdentifierCaseProject, resolveIdentifierCaseFixturesDirectory } from "./identifier-case-test-helpers.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixturesDirectory = resolveIdentifierCaseFixturesDirectory(currentDirectory);

async function createTempProject({
    scriptFixtures = [
        { name: "sample_function", fixture: "top-level-scopes.gml" },
        { name: "sample_struct", fixture: "top-level-struct.gml" }
    ],
    eventFixture = "top-level-instance.gml"
} = {}) {
    return createIdentifierCaseProject({
        fixturesDirectory,
        scriptFixtures,
        eventFixture,
        projectPrefix: "gml-top-level-"
    });
}

void describe("identifier case top-level renaming", () => {
    void it("does not generate top-level rename plans during dry-run formatting", async () => {
        const { projectRoot, scripts, event, projectIndex } = await createTempProject();

        try {
            const formatWorkspace = await getFormat();
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            const logger = { log() {} };
            const baseOptions = {
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
                const options: any = {
                    ...baseOptions,
                    filepath: script.path,
                    diagnostics
                };

                const formatted = await formatWorkspace.format(script.source, options);

                if (script.fixture === "top-level-scopes.gml") {
                    assert.ok(formatted.includes("sample_function"), "Dry-run should keep the original function name");
                    assert.ok(!formatted.includes("sampleFunction"));
                    assert.ok(formatted.includes("new sample_struct"));
                    assert.ok(!formatted.includes("new sampleStruct"));
                    assert.ok(formatted.includes("MACRO_VALUE"));
                    assert.ok(!formatted.includes("macroValue"));
                    assert.ok(formatted.includes("global_value"));
                    assert.ok(!formatted.includes("globalValue"));
                } else if (script.fixture === "top-level-struct.gml") {
                    assert.ok(formatted.includes("sample_struct"), "Dry-run should keep constructor names");
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

                const formattedEvent = await formatWorkspace.format(event.source, eventOptions);
                assert.ok(formattedEvent.includes("instance_counter"), "Dry-run should keep instance variables");
                assert.ok(!formattedEvent.includes("instanceCounter"));

                const store = getIdentifierCaseOptionStore(event.path);
                if (store?.__identifierCaseRenamePlan) {
                    collectedPlans.push(store.__identifierCaseRenamePlan);
                }
            }

            const aggregatedOperations = collectedPlans.flatMap((plan) =>
                Array.isArray(plan?.operations) ? plan.operations : []
            );
            assert.equal(aggregatedOperations.length, 0);
        } finally {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    void it("does not apply top-level renames during write-mode formatting", async () => {
        const { projectRoot, scripts, event, projectIndex } = await createTempProject();

        try {
            const formatWorkspace = await getFormat();
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            const baseOptions = {
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
                const options: any = {
                    ...baseOptions,
                    filepath: script.path,
                    diagnostics
                };

                const rewritten = await formatWorkspace.format(script.source, options);

                if (script.fixture === "top-level-scopes.gml") {
                    assert.ok(rewritten.includes("sample_function("));
                    assert.ok(rewritten.includes("function sample_function"));
                    assert.ok(rewritten.includes("MACRO_VALUE"));
                    assert.ok(rewritten.includes("globalvar global_value"));
                    assert.ok(rewritten.includes("function_result"));
                    assert.ok(rewritten.includes("new sample_struct"));
                } else if (script.fixture === "top-level-struct.gml") {
                    assert.ok(rewritten.includes("function sample_struct("));
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
                const rewrittenEvent = await formatWorkspace.format(event.source, eventOptions);
                assert.ok(rewrittenEvent.includes("instance_counter"));
            }
        } finally {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    void it("does not emit top-level collision plans during formatting", async () => {
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
            const formatWorkspace = await getFormat();
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            setIdentifierCaseDryRunContext({
                filepath: script.path,
                projectIndex,
                dryRun: true
            });

            const diagnostics = [];
            const formatOptions = {
                filepath: script.path,
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseFunctions: "camel",
                gmlIdentifierCaseGlobals: "camel",
                gmlIdentifierCaseAssets: "off",
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: true,
                diagnostics
            };

            const formatted = await formatWorkspace.format(script.source, formatOptions);
            assert.ok(formatted.includes("function global_value"), "Collisions should prevent rewriting");
            assert.ok(!formatted.includes("function globalValue"));

            const store = getIdentifierCaseOptionStore(script.path);
            const conflicts = store?.__identifierCaseConflicts ?? [];
            assert.equal(conflicts.length, 0);
        } finally {
            clearIdentifierCaseDryRunContexts();
            clearIdentifierCaseOptionStore(null);
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});
