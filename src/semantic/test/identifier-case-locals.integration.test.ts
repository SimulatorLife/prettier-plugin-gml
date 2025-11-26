import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { buildProjectIndex } from "../src/project-index/index.js";
import {
    setIdentifierCaseDryRunContext,
    clearIdentifierCaseDryRunContexts
} from "../src/identifier-case/identifier-case-context.js";
import { prepareIdentifierCasePlan } from "../src/identifier-case/plan-service.js";
import { maybeReportIdentifierCaseDryRun } from "../src/identifier-case/identifier-case-report.js";
import { Core } from "@gml-modules/core";

// Use Core.* per AGENTS.md rather than destructuring the namespace.

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = (() => {
    const candidates = [
        path.resolve(currentDirectory, "../../plugin/dist/src/plugin-entry.js"),
        path.resolve(currentDirectory, "../../plugin/dist/index.js"),
        path.resolve(currentDirectory, "../../plugin/dist/src/index.js"),
        path.resolve(currentDirectory, "../../plugin/src/plugin-entry.js"),
        path.resolve(currentDirectory, "../../plugin/src/index.js"),
        path.resolve(currentDirectory, "../../plugin/src/plugin-entry.ts")
    ];
    // Also accept top-level repo plugin path when tests run inside the
    // semantic package's dist/test directory (the relative path requires
    // traversing an extra directory level).
    candidates.push(
        path.resolve(
            currentDirectory,
            "../../../plugin/dist/src/plugin-entry.js"
        )
    );
    candidates.push(
        path.resolve(currentDirectory, "../../../plugin/dist/index.js")
    );
    candidates.push(
        path.resolve(currentDirectory, "../../../plugin/dist/src/index.js")
    );
    candidates.push(
        path.resolve(currentDirectory, "../../../plugin/src/plugin-entry.js")
    );
    candidates.push(
        path.resolve(currentDirectory, "../../../plugin/src/index.js")
    );
    candidates.push(
        path.resolve(currentDirectory, "../../../plugin/src/plugin-entry.ts")
    );

    for (const p of candidates) {
        if (existsSync(p)) return p;
    }

    // If no candidate exists, return the first candidate as a deterministic
    // fallback so errors appear in a consistent place when running tests.
    return candidates[0];
})();
const fixturesDirectory = path.join(
    currentDirectory,
    "identifier-case-fixtures"
);

async function createTempProject(fixtureFileName = "locals.gml") {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-identifier-case-")
    );

    const writeFile = async (relativePath, contents) => {
        const absolutePath = path.join(tempRoot, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents, "utf8");
        return absolutePath;
    };

    await writeFile(
        "MyGame.yyp",
        JSON.stringify({ name: "MyGame", resourceType: "GMProject" })
    );

    await writeFile(
        "scripts/demo/demo.yy",
        JSON.stringify({
            resourceType: "GMScript",
            name: "demo"
        })
    );

    const fixturePath = path.join(fixturesDirectory, fixtureFileName);
    const fixtureSource = await fs.readFile(fixturePath, "utf8");
    const gmlPath = await writeFile("scripts/demo/demo.gml", fixtureSource);

    const projectIndex = await buildProjectIndex(tempRoot);

    return {
        projectRoot: tempRoot,
        fixtureSource,
        gmlPath,
        projectIndex
    };
}

describe("identifier case local renaming", { concurrency: false }, () => {
    it("reports planned renames and conflicts during dry-run", async () => {
        const { projectRoot, fixtureSource, gmlPath, projectIndex } =
            await createTempProject();

        const consoleMessages = [];
        const restoreConsole = mock.method(console, "log", (...args) => {
            consoleMessages.push(args.join(" "));
        });

        try {
            clearIdentifierCaseDryRunContexts();
            const messages = [];
            const logger = {
                log(message) {
                    messages.push(message);
                },
                warn(message) {
                    messages.push(`WARN: ${message}`);
                }
            };
            setIdentifierCaseDryRunContext({
                filepath: gmlPath,
                projectIndex,
                dryRun: true,
                logger
            });
            const diagnostics = [];

            const formatOptions = {
                plugins: [pluginPath],
                parser: "gml-parse",
                filepath: gmlPath,
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseFunctions: "off",
                gmlIdentifierCaseStructs: "off",
                gmlIdentifierCaseMacros: "off",
                gmlIdentifierCaseInstance: "off",
                gmlIdentifierCaseGlobals: "off",
                gmlIdentifierCaseAssets: "off",
                gmlIdentifierCaseIgnore: "ignore*",
                gmlIdentifierCasePreserve: "preserve_me",
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: true,
                diagnostics,
                logger
            };

            const formatted = await prettier.format(
                fixtureSource,
                formatOptions
            );

            assert.ok(
                formatted.includes("counter_value"),
                "Dry-run should not rewrite identifiers in the source"
            );
            assert.ok(
                !formatted.includes("counterValue"),
                "Dry-run should not apply rename targets"
            );

            const combinedMessages =
                messages.length > 0 ? messages : consoleMessages;
            assert.ok(
                combinedMessages.length > 0,
                "Expected reporting output to be logged"
            );
            const summaryText = combinedMessages.join("\n");
            assert.match(summaryText, /Planned renames: 1/);
            assert.match(summaryText, /Conflicts: 3/);
            assert.match(summaryText, /counter_value -> counterValue/);

            const codes = new Set();
            if (Core.isNonEmptyArray(diagnostics)) {
                const summaryDiagnostic = diagnostics.find(
                    (entry) => entry?.code === "gml-identifier-case-summary"
                );
                if (summaryDiagnostic) {
                    assert.strictEqual(
                        summaryDiagnostic.summary.renameCount,
                        1
                    );
                    assert.strictEqual(
                        summaryDiagnostic.summary.conflictCount,
                        3
                    );

                    const renamePlan = summaryDiagnostic.renames ?? [];
                    assert.strictEqual(renamePlan.length, 1);
                    const [operation] = renamePlan;
                    assert.strictEqual(operation.fromName, "counter_value");
                    assert.strictEqual(operation.toName, "counterValue");

                    const conflicts = summaryDiagnostic.conflicts ?? [];
                    for (const conflict of conflicts) {
                        if (conflict?.code) {
                            codes.add(conflict.code);
                        }
                    }
                }
            }

            if (codes.size === 0) {
                for (const line of summaryText.split("\n")) {
                    if (line.includes("[preserve]")) {
                        codes.add("preserve");
                    }
                    if (line.includes("[ignored]")) {
                        codes.add("ignored");
                    }
                    if (line.includes("[collision]")) {
                        codes.add("collision");
                    }
                }
            }

            assert.ok(codes.has("preserve"));
            assert.ok(codes.has("ignored"));
            assert.ok(codes.has("collision"));
        } finally {
            restoreConsole.mock.restore();
            clearIdentifierCaseDryRunContexts();
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    it("applies local identifier renames when write mode is enabled", async () => {
        const { projectRoot, fixtureSource, gmlPath, projectIndex } =
            await createTempProject();

        try {
            clearIdentifierCaseDryRunContexts();
            setIdentifierCaseDryRunContext({
                filepath: gmlPath,
                projectIndex,
                dryRun: false
            });
            const diagnostics = [];
            const formatOptions = {
                plugins: [pluginPath],
                parser: "gml-parse",
                filepath: gmlPath,
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseFunctions: "off",
                gmlIdentifierCaseStructs: "off",
                gmlIdentifierCaseMacros: "off",
                gmlIdentifierCaseInstance: "off",
                gmlIdentifierCaseGlobals: "off",
                gmlIdentifierCaseAssets: "off",
                gmlIdentifierCaseIgnore: "ignore*",
                gmlIdentifierCasePreserve: "preserve_me",
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: false,
                diagnostics
            };

            const formatted = await prettier.format(
                fixtureSource,
                formatOptions
            );

            assert.match(formatted, /counterValue/);
            assert.match(formatted, /preserve_me/);
            assert.match(formatted, /ignore_temp/);
            assert.match(formatted, /foo_bar/);
            assert.match(formatted, /fooBar/);

            assert.ok(
                !formatted.includes("counter_value"),
                "Write mode should update declaration references"
            );
            assert.strictEqual(diagnostics.length, 0);
        } finally {
            clearIdentifierCaseDryRunContexts();
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    it("differentiates dry-run versus write output for eligible locals", async () => {
        const { projectRoot, fixtureSource, gmlPath, projectIndex } =
            await createTempProject("locals-write.gml");

        const baseOptions = {
            plugins: [pluginPath],
            parser: "gml-parse",
            filepath: gmlPath,
            gmlIdentifierCase: "camel",
            gmlIdentifierCaseFunctions: "off",
            gmlIdentifierCaseStructs: "off",
            gmlIdentifierCaseMacros: "off",
            gmlIdentifierCaseInstance: "off",
            gmlIdentifierCaseGlobals: "off",
            gmlIdentifierCaseAssets: "off",
            __identifierCaseProjectIndex: projectIndex
        };

        try {
            clearIdentifierCaseDryRunContexts();
            setIdentifierCaseDryRunContext({
                filepath: gmlPath,
                projectIndex,
                dryRun: true
            });

            const dryRunOptions = {
                ...baseOptions,
                __identifierCaseDryRun: true,
                diagnostics: [],
                logger: { log() {} }
            };

            const dryRunOutput = await prettier.format(
                fixtureSource,
                dryRunOptions
            );

            assert.match(dryRunOutput, /should_rename/);
            assert.ok(
                !dryRunOutput.includes("shouldRename"),
                "Dry-run should preserve original identifier spelling"
            );

            clearIdentifierCaseDryRunContexts();
            setIdentifierCaseDryRunContext({
                filepath: gmlPath,
                projectIndex,
                dryRun: false
            });

            const writeOptions = {
                ...baseOptions,
                __identifierCaseDryRun: false,
                diagnostics: []
            };

            const writeOutput = await prettier.format(
                fixtureSource,
                writeOptions
            );

            assert.match(writeOutput, /shouldRename/);
            assert.ok(
                !writeOutput.includes("should_rename"),
                "Write mode should apply the converted identifier"
            );

            const writeReportOptions = {
                ...baseOptions,
                __identifierCaseDryRun: false
            };
            await prepareIdentifierCasePlan(writeReportOptions);
            const writeReport =
                maybeReportIdentifierCaseDryRun(writeReportOptions);
            assert.ok(writeReport, "Expected write mode report to be recorded");
            assert.strictEqual(writeReport.summary.renameCount, 1);
            assert.strictEqual(writeReport.summary.conflictCount, 0);
        } finally {
            clearIdentifierCaseDryRunContexts();
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});
