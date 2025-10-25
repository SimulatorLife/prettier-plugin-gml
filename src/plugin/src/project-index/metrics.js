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
// Those flows treat the tracker as an interchangeable dependency injection
// seam: external hosts can provide their own metric recorder, but every caller
// still `await`s the timer cleanup callbacks and persists the final snapshot to
// disk. If a host passes a truthy-but-incomplete tracker we cannot simply bail
// out. Dropping the callbacks or returning nullish sentinels would short-circuit
// the timing wrappers and hang cache invalidation waits, while omitting
// `snapshot`/`finalize` would crash cache writers that persist the metrics
// summary on shutdown. Maintaining a "no-op" façade that mirrors
// `createMetricsTracker` keeps the asynchronous contract intact so CLI runs
// continue to log timings and long-lived integrations remain resilient even
// when a custom tracker regresses. Altering this guardrail would ripple through
// every state transition that depends on metrics-driven heuristics, so the
// shim must behave like the real tracker apart from discarding the results.
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
