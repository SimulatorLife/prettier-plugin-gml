import { toArrayFromIterable } from "../utils/array.js";
import { incrementMapValue } from "../utils/object.js";
import { getNonEmptyString, normalizeStringList } from "../utils/string.js";

const hasHrtime = typeof process?.hrtime?.bigint === "function";

function nowMs() {
    if (hasHrtime) {
        const ns = process.hrtime.bigint();
        return Number(ns / 1_000_000n);
    }
    return Date.now();
}

function normalizeLabel(label) {
    return getNonEmptyString(label) ?? "unknown";
}

const DEFAULT_CACHE_KEYS = Object.freeze(["hits", "misses", "stale"]);
const SUMMARY_SECTIONS = Object.freeze([
    "timings",
    "counters",
    "caches",
    "metadata"
]);

/**
 * Historically `createMetricsTracker` returned a monolithic "tracker" object
 * with timing, counter, cache, and reporting helpers all hanging off the same
 * surface. Downstream modules that only needed to bump counters—or simply read
 * the snapshot—still depended on the entire API. Grouping the responsibilities
 * into focused contracts lets call sites depend solely on the collaborators
 * they actually exercise.
 */

/**
 * @typedef {object} MetricsSnapshot
 * @property {string} category
 * @property {number} totalTimeMs
 * @property {Record<string, number>} timings
 * @property {Record<string, number>} counters
 * @property {Record<string, Record<string, number>>} caches
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef {object} MetricsTimingTools
 * @property {(label: string) => () => void} startTimer
 * @property {(label: string, callback: () => any) => any} timeSync
 * @property {(label: string, callback: () => Promise<any>) => Promise<any>} timeAsync
 */

/**
 * @typedef {object} MetricsCounterTools
 * @property {(label: string, amount?: number) => void} increment
 */

/**
 * @typedef {object} MetricsCacheTools
 * @property {(cacheName: string) => void} recordHit
 * @property {(cacheName: string) => void} recordMiss
 * @property {(cacheName: string) => void} recordStale
 * @property {(cacheName: string, key: string, amount?: number) => void} recordMetric
 */

/**
 * @typedef {object} MetricsReportingTools
 * @property {(extra?: object) => MetricsSnapshot} snapshot
 * @property {(extra?: object) => MetricsSnapshot} finalize
 * @property {(message?: string, extra?: object) => void} logSummary
 * @property {(key: string, value: unknown) => void} setMetadata
 */

/**
 * @typedef {object} MetricsTracker
 * @property {string} category
 * @property {MetricsTimingTools} timers
 * @property {MetricsCounterTools} counters
 * @property {MetricsCacheTools} caches
 * @property {MetricsReportingTools} reporting
 */

function isIterable(value) {
    return (
        value !== null &&
        value !== undefined &&
        typeof value[Symbol.iterator] === "function"
    );
}

function normalizeCacheKeys(keys) {
    const candidates =
        typeof keys === "string" || Array.isArray(keys)
            ? keys
            : isIterable(keys)
              ? toArrayFromIterable(keys)
              : DEFAULT_CACHE_KEYS;

    const normalized = normalizeStringList(candidates, {
        allowInvalidType: true
    });

    if (normalized.length > 0) {
        return normalized;
    }

    return [...DEFAULT_CACHE_KEYS];
}

function normalizeIncrementAmount(amount, fallback = 1) {
    if (amount === undefined) {
        return fallback;
    }

    const numeric = Number(amount);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toPlainObject(map) {
    return Object.fromEntries(map);
}

function createMapIncrementer(store) {
    return (label, amount = 1) => {
        const normalized = normalizeLabel(label);
        incrementMapValue(store, normalized, amount);
    };
}

function ensureCacheStats(caches, cacheKeys, cacheName) {
    const normalized = normalizeLabel(cacheName);
    let stats = caches.get(normalized);

    if (!stats) {
        stats = new Map(cacheKeys.map((key) => [key, 0]));
        caches.set(normalized, stats);
    }

    return stats;
}

function incrementCacheMetric(caches, cacheKeys, cacheName, key, amount = 1) {
    const stats = ensureCacheStats(caches, cacheKeys, cacheName);
    const normalizedKey = normalizeLabel(key);

    if (!stats.has(normalizedKey)) {
        stats.set(normalizedKey, 0);
    }

    const increment = normalizeIncrementAmount(
        amount,
        amount === undefined ? 1 : 0
    );

    if (increment === 0) {
        return;
    }

    stats.set(normalizedKey, (stats.get(normalizedKey) ?? 0) + increment);
}

function mergeSummarySections(summary, extra) {
    for (const key of SUMMARY_SECTIONS) {
        const additions = extra[key];
        if (additions && typeof additions === "object") {
            Object.assign(summary[key], additions);
        }
    }
}

function createSnapshotFactory({
    category,
    startTime,
    timings,
    counters,
    caches,
    metadata
}) {
    return (extra = {}) => {
        const summary = {
            category,
            totalTimeMs: nowMs() - startTime,
            timings: toPlainObject(timings),
            counters: toPlainObject(counters),
            caches: Object.fromEntries(
                Array.from(caches, ([name, stats]) => [
                    name,
                    toPlainObject(stats)
                ])
            ),
            metadata: { ...metadata }
        };

        if (!extra || typeof extra !== "object") {
            return summary;
        }

        mergeSummarySections(summary, extra);
        return summary;
    };
}

function createSummaryLogger({ logger, category, snapshot }) {
    if (!logger || typeof logger.debug !== "function") {
        return () => {};
    }

    return (message = "summary", extra = {}) => {
        logger.debug(`[${category}] ${message}`, snapshot(extra));
    };
}

function createFinalizer({
    autoLog,
    logger,
    category,
    snapshot,
    timings,
    counters,
    caches,
    metadata,
    state
}) {
    const hasDebug = typeof logger?.debug === "function";

    return (extra = {}) => {
        const report = snapshot(extra);
        if (autoLog && hasDebug && !state.hasLoggedSummary) {
            logger.debug(`[${category}] summary`, report);
            state.hasLoggedSummary = true;
        }

        timings.clear();
        counters.clear();
        caches.clear();
        for (const key of Object.keys(metadata)) {
            delete metadata[key];
        }

        return report;
    };
}

/**
 * Construct a metrics tracker that records timing, counter, cache, and metadata
 * information for a formatter run.
 *
 * The tracker intentionally embraces loose inputs so callers can feed
 * user-supplied configuration without pre-validating everything. Cache keys can
 * arrive as iterables, timers tolerate synchronous or asynchronous callbacks,
 * and metadata gracefully ignores blank labels. All numeric inputs are coerced
 * through {@link Number} to avoid `NaN` pollution while still accepting string
 * representations from environment variables.
 *
 * @param {{
 *   category?: string,
 *   logger?: { debug?: (message: string, payload: unknown) => void } | null,
 *   autoLog?: boolean,
 *   cacheKeys?: Iterable<string> | ArrayLike<string>
 * }} [options]
 * @returns {MetricsTracker}
 */
export function createMetricsTracker({
    category = "metrics",
    logger = null,
    autoLog = false,
    cacheKeys: cacheKeyOption
} = {}) {
    const startTime = nowMs();
    const timings = new Map();
    const counters = new Map();
    const caches = new Map();
    const metadata = Object.create(null);
    const cacheKeys = normalizeCacheKeys(cacheKeyOption);
    const state = { hasLoggedSummary: false };

    const incrementTiming = createMapIncrementer(timings);
    const incrementCounterBy = createMapIncrementer(counters);
    const snapshot = createSnapshotFactory({
        category,
        startTime,
        timings,
        counters,
        caches,
        metadata
    });
    const logSummary = createSummaryLogger({ logger, category, snapshot });
    const finalize = createFinalizer({
        autoLog,
        logger,
        category,
        snapshot,
        timings,
        counters,
        caches,
        metadata,
        state
    });

    function recordTiming(label, durationMs) {
        incrementTiming(label, Math.max(0, durationMs));
    }

    function startTimer(label) {
        const startedAt = nowMs();
        return () => {
            recordTiming(label, nowMs() - startedAt);
        };
    }

    function timeSync(label, callback) {
        const stop = startTimer(label);
        try {
            return callback();
        } finally {
            stop();
        }
    }

    async function timeAsync(label, callback) {
        const stop = startTimer(label);
        try {
            return await callback();
        } finally {
            stop();
        }
    }

    function incrementCounter(label, amount = 1) {
        incrementCounterBy(label, amount);
    }

    function setMetadata(key, value) {
        const normalizedKey = getNonEmptyString(key);
        if (!normalizedKey) {
            return;
        }
        metadata[normalizedKey] = value;
    }

    function recordCacheEvent(cacheName, key, amount = 1) {
        incrementCacheMetric(caches, cacheKeys, cacheName, key, amount);
    }

    const timingTools = Object.freeze({
        startTimer,
        timeSync,
        timeAsync
    });

    const counterTools = Object.freeze({
        increment: incrementCounter
    });

    const cacheTools = Object.freeze({
        recordHit(cacheName) {
            recordCacheEvent(cacheName, "hits");
        },
        recordMiss(cacheName) {
            recordCacheEvent(cacheName, "misses");
        },
        recordStale(cacheName) {
            recordCacheEvent(cacheName, "stale");
        },
        recordMetric(cacheName, key, amount = 1) {
            recordCacheEvent(cacheName, key, amount);
        }
    });

    const reportingTools = Object.freeze({
        snapshot,
        finalize,
        logSummary,
        setMetadata
    });

    return {
        category,
        timers: timingTools,
        counters: counterTools,
        caches: cacheTools,
        reporting: reportingTools
    };
}
