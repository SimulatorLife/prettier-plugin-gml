import { createMetricsTracker } from "../metrics/metrics-tracker.js";

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

function createNoopProjectIndexMetrics() {
    const snapshot = createMetricsSnapshot;

    return {
        category: PROJECT_INDEX_METRICS_CATEGORY,
        startTimer() {
            return () => {};
        },
        async timeAsync(_label, callback) {
            return await callback();
        },
        timeSync(_label, callback) {
            return callback();
        },
        incrementCounter() {},
        setMetadata() {},
        recordCacheHit() {},
        recordCacheMiss() {},
        recordCacheStale() {},
        snapshot,
        finalize(extra = {}) {
            return createMetricsSnapshot(extra);
        },
        logSummary() {}
    };
}

export function createProjectIndexMetrics(options = {}) {
    const { metrics, logger = null, logMetrics = false } = options ?? {};

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
