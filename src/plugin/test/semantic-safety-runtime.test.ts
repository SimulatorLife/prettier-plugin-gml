import assert from "node:assert/strict";
import test from "node:test";

import {
    Plugin,
    restoreDefaultRefactorRuntime,
    restoreDefaultSemanticSafetyRuntime,
    setRefactorRuntime,
    setSemanticSafetyRuntime
} from "../src/index.js";

type SemanticSafetyReportRecord = {
    code: string;
    mode: string;
};

function resetSemanticSafetyRuntimes() {
    restoreDefaultSemanticSafetyRuntime();
    restoreDefaultRefactorRuntime();
}

void test(
    "preserves uninitialized globalvar declarations when project-safe rewrite is unavailable",
    { concurrency: false },
    async () => {
    const reports: Array<SemanticSafetyReportRecord> = [];

    try {
        const formatted = await Plugin.format("globalvar score;\n", {
            preserveGlobalVarStatements: false,
            __semanticSafetyReportService(report: SemanticSafetyReportRecord) {
                reports.push(report);
            }
        });

        assert.strictEqual(formatted, "globalvar score;\n");
        assert.ok(
            reports.some((report) => report.code === "GML_SEMANTIC_SAFETY_GLOBALVAR_SKIP"),
            "Expected an explicit semantic-safety skip report for uninitialized globalvar rewrites."
        );
    } finally {
        resetSemanticSafetyRuntimes();
    }
    }
);

void test(
    "rewrites uninitialized globalvar declarations when project-aware runtime allows undefined initialization",
    { concurrency: false },
    async () => {
        try {
            setSemanticSafetyRuntime({
                assessGlobalVarRewrite() {
                    return {
                        allowRewrite: true,
                        initializerMode: "undefined",
                        mode: "project-aware"
                    };
                },
                resolveLoopHoistIdentifier(context) {
                    return {
                        identifierName: context.preferredName,
                        mode: "project-aware"
                    };
                }
            });

            const formatted = await Plugin.format("globalvar score;\n", {
                preserveGlobalVarStatements: false
            });

            assert.strictEqual(formatted, "global.score = undefined;\n");
        } finally {
            resetSemanticSafetyRuntimes();
        }
    }
);

void test(
    "skips globalvar rewrites that require project-wide edits when refactor runtime reports cross-file usage",
    { concurrency: false },
    async () => {
        const reports: Array<SemanticSafetyReportRecord> = [];

        try {
            setSemanticSafetyRuntime({
                assessGlobalVarRewrite() {
                    return {
                        allowRewrite: true,
                        initializerMode: "undefined",
                        mode: "project-aware"
                    };
                },
                resolveLoopHoistIdentifier(context) {
                    return {
                        identifierName: context.preferredName,
                        mode: "project-aware"
                    };
                }
            });

            setRefactorRuntime({
                isIdentifierNameOccupiedInProject() {
                    return false;
                },
                listIdentifierOccurrenceFiles() {
                    return new Set(["/workspace/scripts/a.gml", "/workspace/scripts/b.gml"]);
                }
            });

            const formatted = await Plugin.format("globalvar score;\n", {
                filepath: "/workspace/scripts/a.gml",
                preserveGlobalVarStatements: false,
                __semanticSafetyReportService(report: SemanticSafetyReportRecord) {
                    reports.push(report);
                }
            });

            assert.strictEqual(formatted, "globalvar score;\n");
            assert.ok(
                reports.some((report) => report.code === "GML_SEMANTIC_SAFETY_GLOBALVAR_PROJECT_SKIP"),
                "Expected a project-aware skip report when cross-file globalvar edits are required."
            );
        } finally {
            resetSemanticSafetyRuntimes();
        }
    }
);

void test(
    "renames hoisted loop cache variables when local fallback detects collisions",
    { concurrency: false },
    async () => {
        const reports: Array<SemanticSafetyReportRecord> = [];
        const source = [
            "function demo(value_list) {",
            "    var value_list_len = 0;",
            "    for (var i = 0; i < array_length(value_list); i += 1) {",
            "        show_debug_message(value_list[i]);",
            "    }",
            "}",
            ""
        ].join("\n");

        try {
            const formatted = await Plugin.format(source, {
                __semanticSafetyReportService(report: SemanticSafetyReportRecord) {
                    reports.push(report);
                }
            });

            assert.ok(
                formatted.includes("var value_list_len_1 = array_length(value_list);"),
                "Expected loop hoisting to choose a collision-free local cache name."
            );
            assert.ok(
                reports.some((report) => report.code === "GML_SEMANTIC_SAFETY_LOOP_HOIST_RENAMED"),
                "Expected a semantic-safety report when loop hoist naming is adjusted."
            );
        } finally {
            resetSemanticSafetyRuntimes();
        }
    }
);

void test(
    "uses project-aware occupancy checks when the runtime adapter is available",
    { concurrency: false },
    async () => {
        const reports: Array<SemanticSafetyReportRecord> = [];
        const source = [
            "function demo(value_list) {",
            "    for (var i = 0; i < array_length(value_list); i += 1) {",
            "        show_debug_message(value_list[i]);",
            "    }",
            "}",
            ""
        ].join("\n");

        try {
            setSemanticSafetyRuntime({
                assessGlobalVarRewrite(context) {
                    return {
                        allowRewrite: context.hasInitializer,
                        initializerMode: "existing",
                        mode: "project-aware"
                    };
                },
                resolveLoopHoistIdentifier(context) {
                    return {
                        identifierName: context.preferredName,
                        mode: "project-aware"
                    };
                }
            });

            setRefactorRuntime({
                isIdentifierNameOccupiedInProject({ identifierName }) {
                    return identifierName === "value_list_len";
                },
                listIdentifierOccurrenceFiles() {
                    return new Set();
                }
            });

            const formatted = await Plugin.format(source, {
                __semanticSafetyReportService(report: SemanticSafetyReportRecord) {
                    reports.push(report);
                }
            });

            assert.ok(
                formatted.includes("var value_list_len_1 = array_length(value_list);"),
                "Expected project occupancy checks to force a non-conflicting hoist identifier."
            );
            assert.ok(
                reports.some(
                    (report) =>
                        report.code === "GML_SEMANTIC_SAFETY_LOOP_HOIST_RENAMED" && report.mode === "project-aware"
                ),
                "Expected project-aware loop-hoist rename reports when runtime occupancy checks apply."
            );
        } finally {
            resetSemanticSafetyRuntimes();
        }
    }
);
