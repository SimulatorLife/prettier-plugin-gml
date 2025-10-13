#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import { buildProjectIndex } from "../src/plugin/src/project-index/index.js";
import { prepareIdentifierCasePlan } from "../src/plugin/src/identifier-case/local-plan.js";
import { CliUsageError, handleCliError } from "../src/shared/cli/cli-errors.js";

const USAGE = [
    "Usage: node scripts/bench-identifier-pipeline.mjs [projectRoot] [file] [options]",
    "",
    "Options:",
    "  --verbose  Enable verbose logging (project index metrics and rename plan details).",
    "  --help, -h  Show this help message."
].join("\n");

function parseArguments(argv) {
    const positional = [];
    let verbose = false;
    let helpRequested = false;

    for (const arg of argv) {
        if (arg === "--verbose") {
            verbose = true;
            continue;
        }

        if (arg === "--help" || arg === "-h") {
            helpRequested = true;
            continue;
        }

        if (arg.startsWith("-")) {
            throw new CliUsageError(`Unknown flag: ${arg}`, { usage: USAGE });
        }

        positional.push(arg);
    }

    if (positional.length > 2) {
        throw new CliUsageError(
            `Expected at most 2 positional arguments, received ${positional.length}.`,
            { usage: USAGE }
        );
    }

    return {
        helpRequested,
        verbose,
        projectRootArg: positional[0] ?? null,
        fileArg: positional[1] ?? null
    };
}

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
    const { helpRequested, verbose, projectRootArg, fileArg } = parseArguments(
        process.argv.slice(2)
    );

    if (helpRequested) {
        console.log(USAGE);
        return;
    }

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
    handleCliError(error, {
        prefix: "Failed to run identifier pipeline benchmark."
    });
});
