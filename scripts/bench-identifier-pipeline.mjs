#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import { buildProjectIndex } from "../src/plugin/src/project-index/index.js";
import { prepareIdentifierCasePlan } from "../src/plugin/src/identifier-case/local-plan.js";

function createConsoleLogger(verbose) {
    if (!verbose) {
        return null;
    }
    return {
        debug(...args) {
            console.debug(...args);
        }
    };
}

function formatMetrics(label, metrics) {
    return {
        label,
        totalTimeMs: metrics?.totalTimeMs ?? null,
        counters: metrics?.counters ?? {},
        timings: metrics?.timings ?? {},
        caches: metrics?.caches ?? {},
        metadata: metrics?.metadata ?? {}
    };
}

async function run() {
    const [, , projectRootArg, fileArg, ...rest] = process.argv;
    const flags = new Set(rest);
    const verbose = flags.has("--verbose");
    const projectRoot = path.resolve(projectRootArg ?? process.cwd());

    const logger = createConsoleLogger(verbose);

    const indexRuns = [];
    let latestIndex = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        const index = await buildProjectIndex(projectRoot, undefined, {
            logger,
            logMetrics: verbose
        });
        indexRuns.push(
            formatMetrics(`project-index-run-${attempt}`, index.metrics)
        );
        latestIndex = index;
    }

    const results = {
        projectRoot,
        index: indexRuns
    };

    if (fileArg) {
        const filepath = path.resolve(fileArg);
        const renameOptions = {
            filepath,
            __identifierCaseProjectIndex: latestIndex,
            gmlIdentifierCase: "camel",
            gmlIdentifierCaseLocals: "camel",
            gmlIdentifierCaseAssets: "pascal",
            gmlIdentifierCaseAcknowledgeAssetRenames: true,
            logIdentifierCaseMetrics: verbose,
            logger
        };

        await prepareIdentifierCasePlan(renameOptions);

        results.renamePlan = formatMetrics(
            "identifier-case-plan",
            renameOptions.__identifierCaseMetricsReport
        );
        results.renamePlan.operations =
            renameOptions.__identifierCaseRenamePlan?.operations?.length ?? 0;
        results.renamePlan.conflicts =
            renameOptions.__identifierCaseConflicts?.length ?? 0;
    }

    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
