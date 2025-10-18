import process from "node:process";

const originalSet = globalThis.Set;
let allocationCount = 0;

class CountingSet extends originalSet {
    constructor(...args) {
        super(...args);
        allocationCount += 1;
    }
}

globalThis.Set = CountingSet;

const { normalizeStringList } = await import(
    "../../src/shared/utils/string.js"
);

try {
    if (typeof globalThis.gc !== "function") {
        throw new TypeError(
            "Run with --expose-gc to enable precise heap measurements."
        );
    }

    const iterations = Number.parseInt(process.argv[2] ?? "500000", 10);
    if (!Number.isFinite(iterations) || iterations <= 0) {
        throw new Error("Iteration count must be a positive integer.");
    }

    const sampleValues = Array.from(
        { length: 64 },
        (_, index) => `value_${index % 16}`
    );
    const sampleString = sampleValues.join(", ");

    globalThis.gc();
    const before = process.memoryUsage().heapUsed;

    let totalLength = 0;
    for (let index = 0; index < iterations; index += 1) {
        const result = normalizeStringList(sampleString);
        totalLength += result.length;
    }

    const after = process.memoryUsage().heapUsed;

    globalThis.gc();
    const afterGc = process.memoryUsage().heapUsed;

    const report = {
        iterations,
        totalLength,
        heapUsedBefore: before,
        heapUsedAfter: after,
        heapDelta: after - before,
        heapUsedAfterGc: afterGc,
        heapDeltaAfterGc: afterGc - before,
        setAllocations: allocationCount
    };

    console.log(JSON.stringify(report, null, 2));
} finally {
    globalThis.Set = originalSet;
}
