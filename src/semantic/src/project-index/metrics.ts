import { Core } from "@gml-modules/core";

const PROJECT_INDEX_METRICS_CATEGORY = "project-index";
const REQUIRED_RECORDING_GROUPS = Object.freeze({
    timers: ["startTimer", "timeAsync", "timeSync"],
    counters: ["increment"],
    caches: ["recordHit", "recordMiss", "recordStale", "recordMetric"],
    metadata: ["setMetadata"]
});

const REQUIRED_REPORTING_GROUPS = Object.freeze({
    summary: ["snapshot", "finalize"],
    caches: ["cachesSnapshot", "cacheSnapshot"],
    logger: ["logSummary"]
});

function hasMetricGroup(candidate, groupName, methodNames) {
    const group = candidate?.[groupName];
    return (
        Core.Utils.isObjectLike(group) &&
        methodNames.every((method) => typeof group[method] === "function")
    );
}

function isMetricsRecordingSuite(candidate) {
    if (
        !Core.Utils.isObjectLike(candidate) ||
        typeof candidate.category !== "string"
    ) {
        return false;
    }

    return Object.entries(REQUIRED_RECORDING_GROUPS).every(
        ([groupName, methods]) => hasMetricGroup(candidate, groupName, methods)
    );
}

function isMetricsReportingSuite(candidate) {
    if (!Core.Utils.isObjectLike(candidate)) {
        return false;
    }

    return Object.entries(REQUIRED_REPORTING_GROUPS).every(
        ([groupName, methods]) => hasMetricGroup(candidate, groupName, methods)
    );
}

function isMetricsContracts(candidate) {
    if (!Core.Utils.isObjectLike(candidate)) {
        return false;
    }

    return (
        isMetricsRecordingSuite(candidate.recording) &&
        isMetricsReportingSuite(candidate.reporting)
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

// The project-index builder, rename planner, and CLI performance harness all
// assume that a metrics tracker exposes timing helpers returning cleanup
// handles plus structured snapshot/finalize data (see
// docs/legacy-identifier-case-plan.md#metrics-driven-tuning-and-operational-heuristics).
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
const NOOP_METRIC_RECORDING_GROUPS = Object.freeze({
    timers: Object.freeze({
        startTimer: () => () => {},
        timeAsync: async (_label, callback) => callback(),
        timeSync: (_label, callback) => callback()
    }),
    counters: Object.freeze({
        increment: Core.Utils.noop
    }),
        caches: Object.freeze({
            recordHit: Core.Utils.noop,
            recordMiss: Core.Utils.noop,
            recordStale: Core.Utils.noop,
            recordMetric: Core.Utils.noop
        })
});

const NOOP_METRIC_REPORTING_GROUPS = Object.freeze({
    summary: Object.freeze({
        snapshot: createMetricsSnapshot,
        finalize: createMetricsSnapshot
    }),
    caches: Object.freeze({
        cachesSnapshot: () => ({}),
        cacheSnapshot: () => {}
    }),
        logger: Object.freeze({
            logSummary: Core.Utils.noop
        })
});

function createNoopProjectIndexMetrics() {
    return Object.freeze({
        recording: Object.freeze({
            category: PROJECT_INDEX_METRICS_CATEGORY,
            ...NOOP_METRIC_RECORDING_GROUPS,
                metadata: Object.freeze({
                    setMetadata: Core.Utils.noop
                })
        }),
        reporting: Object.freeze({
            ...NOOP_METRIC_REPORTING_GROUPS
        })
    });
}

export function createProjectIndexMetrics(options = {}) {
    const { metrics, logger = null, logMetrics = false } = options;

    if (isMetricsContracts(metrics)) {
        return metrics;
    }

    if (metrics !== undefined) {
        return createNoopProjectIndexMetrics();
    }

    return Core.Reporting.createMetricsTracker({
        category: PROJECT_INDEX_METRICS_CATEGORY,
        logger,
        autoLog: logMetrics === true
    });
}

export function finalizeProjectIndexMetrics(reporting) {
    if (!isMetricsReportingSuite(reporting)) {
        return null;
    }

    return reporting.summary.finalize();
}
