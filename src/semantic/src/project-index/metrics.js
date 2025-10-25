import { createMetricsTracker } from "../../../shared/index.js";

const PROJECT_INDEX_METRICS_CATEGORY = "project-index";
const REQUIRED_METRIC_GROUPS = Object.freeze({
    timers: ["startTimer", "timeAsync", "timeSync"],
    counters: ["increment"],
    caches: ["recordHit", "recordMiss", "recordStale", "recordMetric"],
    reporting: ["snapshot", "finalize", "setMetadata", "logSummary"]
});

function hasMetricGroup(candidate, groupName, methodNames) {
    const group = candidate?.[groupName];
    return (
        group &&
        typeof group === "object" &&
        methodNames.every((method) => typeof group[method] === "function")
    );
}

function isMetricsTracker(candidate) {
    return (
        candidate &&
        typeof candidate === "object" &&
        Object.entries(REQUIRED_METRIC_GROUPS).every(([groupName, methods]) =>
            hasMetricGroup(candidate, groupName, methods)
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
// summary. Keeping these fallbacks wired like the real implementation protects
// both the CLI (which logs metrics after each run) and long-lived integrations
// that rely on the tracker contract remaining stable even when misconfigured.
const NOOP_METRIC_GROUPS = Object.freeze({
    timers: Object.freeze({
        startTimer: () => () => {},
        timeAsync: async (_label, callback) => await callback(),
        timeSync: (_label, callback) => callback()
    }),
    counters: Object.freeze({
        increment: noop
    }),
    caches: Object.freeze({
        recordHit: noop,
        recordMiss: noop,
        recordStale: noop,
        recordMetric: noop
    }),
    reporting: Object.freeze({
        snapshot: createMetricsSnapshot,
        finalize: createMetricsSnapshot,
        setMetadata: noop,
        logSummary: noop
    })
});

function createNoopProjectIndexMetrics() {
    return {
        category: PROJECT_INDEX_METRICS_CATEGORY,
        ...NOOP_METRIC_GROUPS
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

    return metrics.reporting.finalize();
}
