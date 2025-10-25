import { createMetricsTracker } from "../reporting.js";

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

// The project-index builder, rename planner, and CLI performance harness all
// assume that a metrics tracker exposes timing helpers returning cleanup
// handles plus structured snapshot/finalize data (see
// docs/project-index-cache-design.md#metrics-driven-tuning-and-operational-heuristics).
// When hosts inject a custom tracker we happily delegate to it, but if they
// supply something truthy that fails the capability probe we must degrade to a
// "no-op" shim that preserves the public surface. Dropping the callbacks or
// returning nullish sentinels would short-circuit the timing wrappers and break
// code paths that expect to await the original callback, while omitting
// `snapshot`/`finalize` would crash cache writers that persist the metrics
// summary. Keeping these fallbacks wired like the real implementation protects
// both the CLI (which logs metrics after each run) and long-lived integrations
// that rely on the tracker contract remaining stable even when misconfigured.
const NOOP_METRIC_METHODS = Object.freeze({
    startTimer: () => () => {},
    timeAsync: async (_label, callback) => await callback(),
    timeSync: (_label, callback) => callback(),
    snapshot: createMetricsSnapshot,
    finalize: createMetricsSnapshot,
    incrementCounter: noop,
    setMetadata: noop,
    recordCacheHit: noop,
    recordCacheMiss: noop,
    recordCacheStale: noop,
    logSummary: noop
});

function createNoopProjectIndexMetrics() {
    return {
        category: PROJECT_INDEX_METRICS_CATEGORY,
        ...NOOP_METRIC_METHODS
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
