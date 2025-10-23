import { createMetricsTracker } from "../reporting/metrics.js";

const PROJECT_INDEX_METRICS_CATEGORY = "project-index";
const REQUIRED_METRIC_METHODS = [
    "startTimer",
    "timeAsync",
    "timeSync",
    "incrementCounter",
    "setMetadata",
    "recordCacheHit",
    "recordCacheMiss",
    "recordCacheStale",
    "finalize"
];

function isMetricsTracker(candidate) {
    return (
        candidate &&
        typeof candidate === "object" &&
        REQUIRED_METRIC_METHODS.every(
            (method) => typeof candidate[method] === "function"
        )
    );
}

function createMetricsSnapshot(extra = {}) {
    return {
        category: PROJECT_INDEX_METRICS_CATEGORY,
        totalTimeMs: 0,
        timings: {},
        counters: {},
        caches: {},
        metadata: {},
        ...extra
    };
}

const noop = () => {};

function startNoopTimer() {
    return function stopNoopTimer() {};
}

async function runAsyncCallback(_label, callback) {
    return await callback();
}

function runSyncCallback(_label, callback) {
    return callback();
}

const NOOP_METRIC_HANDLERS = Object.freeze({
    incrementCounter: noop,
    setMetadata: noop,
    recordCacheHit: noop,
    recordCacheMiss: noop,
    recordCacheStale: noop,
    logSummary: noop
});

const finalizeSnapshot = createMetricsSnapshot;

function createNoopProjectIndexMetrics() {
    return {
        category: PROJECT_INDEX_METRICS_CATEGORY,
        startTimer: startNoopTimer,
        timeAsync: runAsyncCallback,
        timeSync: runSyncCallback,
        snapshot: createMetricsSnapshot,
        finalize: finalizeSnapshot,
        ...NOOP_METRIC_HANDLERS
    };
}

export function createProjectIndexMetrics(options = {}) {
    const { metrics, logger = null, logMetrics = false } = options;

    if (isMetricsTracker(metrics)) {
        return metrics;
    }

    if (metrics !== undefined) {
        return createNoopProjectIndexMetrics();
    }

    return createMetricsTracker({
        category: PROJECT_INDEX_METRICS_CATEGORY,
        logger,
        autoLog: logMetrics === true
    });
}

export function finalizeProjectIndexMetrics(metrics) {
    if (!isMetricsTracker(metrics)) {
        return null;
    }

    return metrics.finalize();
}
