#!/usr/bin/env node
import path from "node:path";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

function captureProcessMemory() {
    const {
        rss = 0,
        heapTotal = 0,
        heapUsed = 0,
        external = 0,
        arrayBuffers = 0
    } = process.memoryUsage();
    return { rss, heapTotal, heapUsed, external, arrayBuffers };
}

function computeMemoryDelta(current, baseline) {
    if (!current || !baseline) {
        return null;
    }

    const delta = {};
    for (const [key, beforeValue] of Object.entries(baseline)) {
        const afterValue = current[key];
        if (typeof beforeValue === "number" && typeof afterValue === "number") {
            delta[key] = afterValue - beforeValue;
        }
    }

    return delta;
}

function normalizeDelta(delta, iterations) {
    if (!delta || !iterations || iterations <= 0) {
        return null;
    }

    const normalized = {};
    for (const [key, value] of Object.entries(delta)) {
        if (typeof value === "number") {
            normalized[key] = value / iterations;
        }
    }
    return normalized;
}

function createMemoryTracker({ requirePreciseGc = false } = {}) {
    const gc = typeof globalThis.gc === "function" ? globalThis.gc : null;
    const warnings = [];

    if (!gc && requirePreciseGc) {
        warnings.push(
            "Precise heap measurements require Node to be launched with --expose-gc."
        );
    }

    const runGc = () => {
        if (gc) {
            gc();
        }
    };

    return {
        async measure(executor) {
            runGc();
            const before = captureProcessMemory();
            const start = performance.now();
            const result = await executor();
            const durationMs = performance.now() - start;
            const after = captureProcessMemory();
            let afterGc = null;
            if (gc) {
                runGc();
                afterGc = captureProcessMemory();
            }

            return {
                before,
                after,
                afterGc,
                delta: computeMemoryDelta(after, before),
                deltaAfterGc:
                    afterGc === null
                        ? null
                        : computeMemoryDelta(afterGc, before),
                durationMs,
                warnings,
                result
            };
        }
    };
}

function buildSuiteResult({ measurement }) {
    const {
        before,
        after,
        afterGc,
        delta,
        deltaAfterGc,
        durationMs,
        warnings,
        result
    } = measurement;
    const iterations =
        typeof result?.iterations === "number" && result.iterations > 0
            ? result.iterations
            : null;

    const memory = {
        unit: "bytes",
        before,
        after,
        afterGc,
        delta,
        deltaPerIteration: normalizeDelta(delta, iterations),
        deltaAfterGc,
        deltaAfterGcPerIteration: normalizeDelta(deltaAfterGc, iterations)
    };

    const response = {
        ...result,
        durationMs,
        heapUsedBefore: before?.heapUsed ?? null,
        heapUsedAfter: after?.heapUsed ?? null,
        heapDelta: delta?.heapUsed ?? null,
        heapUsedAfterGc: afterGc?.heapUsed ?? null,
        heapDeltaAfterGc: deltaAfterGc?.heapUsed ?? null,
        rssBefore: before?.rss ?? null,
        rssAfter: after?.rss ?? null,
        rssDelta: delta?.rss ?? null,
        rssAfterGc: afterGc?.rss ?? null,
        rssDeltaAfterGc: deltaAfterGc?.rss ?? null,
        memory
    };

    if (warnings && warnings.length > 0) {
        response.warnings = warnings;
    }

    return response;
}

const MODULE_RESOLVER = createRequire(import.meta.url);
const DEFAULT_PRETTIER_STANDALONE_ID = ["prettier", "standalone.mjs"].join("/");

function resolvePrettierSpecifier() {
    const override = process.env.GML_PRETTIER_STANDALONE_MODULE;
    if (override && override.trim()) {
        return override.trim();
    }

    const resolved = MODULE_RESOLVER.resolve(DEFAULT_PRETTIER_STANDALONE_ID);
    return pathToFileURL(resolved).href;
}

async function loadPrettier() {
    const module = await import(resolvePrettierSpecifier());
    return module?.default ?? module;
}

async function readJson(pathToJson) {
    const raw = await readFile(pathToJson, "utf8");
    return JSON.parse(raw);
}

async function runBenchmark({
    iterations,
    requestedIterations,
    samplePath,
    pluginPath,
    optionsPath,
    notes = []
}) {
    const absoluteSamplePath = path.isAbsolute(samplePath)
        ? samplePath
        : path.resolve(process.cwd(), samplePath);
    const absolutePluginPath = path.isAbsolute(pluginPath)
        ? pluginPath
        : path.resolve(process.cwd(), pluginPath);
    const absoluteOptionsPath = optionsPath
        ? path.isAbsolute(optionsPath)
            ? optionsPath
            : path.resolve(process.cwd(), optionsPath)
        : null;

    const tracker = createMemoryTracker({ requirePreciseGc: true });
    const prettier = await loadPrettier();
    const gmlPlugin = await import(pathToFileURL(absolutePluginPath).href);

    const sampleSource = await readFile(absoluteSamplePath, "utf8");
    let optionOverrides = {};
    if (absoluteOptionsPath) {
        try {
            optionOverrides = await readJson(absoluteOptionsPath);
        } catch (error) {
            if (error && error.code === "ENOENT") {
                notes.push(
                    "Formatter options fixture not found; using plugin defaults."
                );
            } else {
                throw error;
            }
        }
    }

    const formatOptions = {
        ...gmlPlugin.defaultOptions,
        ...optionOverrides,
        parser: "gml-parse",
        plugins: [gmlPlugin],
        filepath: absoluteSamplePath
    };

    const measurement = await tracker.measure(async () => {
        let lastOutput = "";
        for (let index = 0; index < iterations; index += 1) {
            lastOutput = await prettier.format(sampleSource, formatOptions);
        }

        const sampleBytes = Buffer.byteLength(sampleSource, "utf8");
        const outputBytes = Buffer.byteLength(lastOutput, "utf8");

        return {
            description:
                "Formats a complex GameMaker script using the Prettier plugin printers.",
            iterations,
            requestedIterations,
            notes: notes.length > 0 ? notes : undefined,
            sample: {
                path: absoluteSamplePath,
                bytes: sampleBytes,
                lines: sampleSource.split(/\r?\n/).length
            },
            output: {
                bytes: outputBytes,
                changed: lastOutput !== sampleSource,
                deltaBytes: outputBytes - sampleBytes
            },
            options: {
                printWidth: formatOptions.printWidth,
                tabWidth: formatOptions.tabWidth,
                semi: formatOptions.semi
            }
        };
    });

    return buildSuiteResult({ measurement });
}

async function main() {
    if (process.argv.length < 3) {
        throw new Error("Benchmark payload argument is required.");
    }

    const payload = JSON.parse(process.argv[2] ?? "{}");
    const {
        iterations,
        requestedIterations,
        samplePath,
        pluginPath,
        optionsPath,
        notes
    } = payload;

    const result = await runBenchmark({
        iterations,
        requestedIterations,
        samplePath,
        pluginPath,
        optionsPath,
        notes
    });

    process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
}

main().catch((error) => {
    process.stdout.write(
        `${JSON.stringify({
            ok: false,
            error: {
                name: error?.name ?? "Error",
                message: error?.message ?? "Unknown error",
                stack:
                    typeof error?.stack === "string"
                        ? error.stack.split("\n")
                        : undefined
            }
        })}\n`
    );
    process.exitCode = 1;
});
