import {
    setIdentifierCaseOption,
    clearIdentifierCaseOptionStore
} from "../src/plugin/src/identifier-case/option-store.js";

const SAMPLE_COUNT = parseInt(process.env.SAMPLE_COUNT ?? "2000", 10);
const LOG_INTERVAL = parseInt(process.env.LOG_INTERVAL ?? "200", 10);
const PLAN_OPERATION_COUNT = parseInt(
    process.env.PLAN_OPERATION_COUNT ?? "512",
    10
);
const PAYLOAD = "x".repeat(parseInt(process.env.PAYLOAD_SIZE ?? "256", 10));

function formatBytes(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function createRenamePlan(id) {
    const operations = Array.from(
        { length: PLAN_OPERATION_COUNT },
        (_, index) => ({
            id: `${id}:operation:${index}`,
            original: `identifier_${id}_${index}`,
            replacement: `${PAYLOAD}_${id}_${index}`
        })
    );

    return {
        id: `plan-${id}`,
        createdAt: Date.now(),
        operations
    };
}

function logMemoryUsage(label) {
    if (typeof global.gc === "function") {
        global.gc();
    }
    const { rss, heapTotal, heapUsed } = process.memoryUsage();
    console.log(
        `${label}\trss=${formatBytes(rss)}\theapUsed=${formatBytes(heapUsed)}\theapTotal=${formatBytes(heapTotal)}`
    );
}

async function main() {
    console.log(
        `Simulating ${SAMPLE_COUNT} option store entries (${PLAN_OPERATION_COUNT} operations each)`
    );
    logMemoryUsage("start");

    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        const options = {
            filepath: `/virtual/project/scripts/file-${index}.gml`
        };
        const plan = createRenamePlan(index);
        setIdentifierCaseOption(options, "__identifierCaseRenamePlan", plan);

        if ((index + 1) % LOG_INTERVAL === 0) {
            logMemoryUsage(`after ${index + 1}`);
        }
    }

    logMemoryUsage("final");
    clearIdentifierCaseOptionStore(null);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
