// Measure the heap impact of building the project index. This script imports the
// shared project-index module and triggers the `buildProjectIndex` helper using
// a stubbed file-system facade so the benchmark focuses on identifier caching.

if (typeof global.gc !== "function") {
    throw new Error(
        "Run this script with 'node --expose-gc scripts/measure-project-index-memory.mjs'"
    );
}

function formatBytes(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
}

async function measureBuildProjectIndexMemory() {
    const { buildProjectIndex } = await import(
        "../src/plugin/src/project-index/index.js"
    );

    const fsFacade = {
        async readDir() {
            return [];
        },
        async stat() {
            return { mtimeMs: 0 };
        },
        async readFile(targetPath, encoding) {
            if (targetPath.endsWith("gml-identifiers.json")) {
                const fs = await import("node:fs/promises");
                return fs.readFile(targetPath, encoding);
            }

            const error = new Error("ENOENT");
            error.code = "ENOENT";
            throw error;
        }
    };

    global.gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = process.memoryUsage().heapUsed;

    await buildProjectIndex("/tmp/prettier-plugin-gml", fsFacade);

    global.gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const after = process.memoryUsage().heapUsed;

    return {
        before,
        after,
        delta: after - before
    };
}

const result = await measureBuildProjectIndexMemory();
console.log(
    JSON.stringify(
        {
            before: result.before,
            after: result.after,
            delta: result.delta,
            formatted: {
                before: formatBytes(result.before),
                after: formatBytes(result.after),
                delta: formatBytes(Math.abs(result.delta))
            }
        },
        null,
        2
    )
);
