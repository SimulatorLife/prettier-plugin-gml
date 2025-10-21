import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
    registerCliProjectIndexBuilder,
    registerCliIdentifierCasePlanPreparer,
    resetRegisteredCliPluginServices
} from "../lib/plugin-services.js";
import { runIdentifierPipelineBenchmark } from "../lib/performance-cli.js";

describe("performance CLI resource cleanup", { concurrency: false }, () => {
    afterEach(() => {
        resetRegisteredCliPluginServices();
    });

    it("disposes identifier case bootstrap after rename plan generation", async () => {
        let disposeCalls = 0;

        registerCliProjectIndexBuilder(async () => ({
            metrics: { totalTimeMs: 1, counters: {}, timings: {}, caches: {} },
            resources: {},
            scopes: {},
            files: {},
            relationships: {},
            identifiers: {}
        }));

        registerCliIdentifierCasePlanPreparer(async (options) => {
            options.__identifierCaseProjectIndexBootstrap = {
                dispose() {
                    disposeCalls += 1;
                }
            };
            options.__identifierCaseMetricsReport = { totalTimeMs: 5 };
            options.__identifierCaseRenamePlan = { operations: [1, 2] };
            options.__identifierCaseConflicts = [{ code: "demo" }];
        });

        const result = await runIdentifierPipelineBenchmark({
            projectRoot: path.resolve("tmp-project"),
            file: path.resolve("tmp-project/file.gml"),
            verbose: false
        });

        assert.equal(
            disposeCalls,
            1,
            "Identifier case bootstrap should be disposed after benchmarking"
        );
        assert.equal(result.renamePlan?.operations, 2);
        assert.equal(result.renamePlan?.conflicts, 1);
    });
});
