import { isObjectLike } from "../../../shared/object-utils.js";
import { createMetricsTracker } from "../../../shared/metrics-tracker.js";

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
        isObjectLike(candidate) &&
        REQUIRED_METRIC_METHODS.every(
            (method) => typeof candidate[method] === "function"
        )
    );
}

function createNoopMetricsTracker() {
    return {
        category: "project-index",
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
        snapshot(extra = {}) {
            return {
                category: "project-index",
                totalTimeMs: 0,
                timings: {},
                counters: {},
                caches: {},
                metadata: {},
                ...extra
            };
        },
        finalize(extra = {}) {
            return this.snapshot(extra);
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
        return createNoopMetricsTracker();
    }

    return createMetricsTracker({
        category: "project-index",
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

export function isProjectIndexMetrics(candidate) {
    return isMetricsTracker(candidate);
}
