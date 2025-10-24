import { toArrayFromIterable } from "../array-utils.js";
import { getNonEmptyString, normalizeStringList } from "../string-utils.js";

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

function normalizeCacheKeys(keys) {
    let entries;

    if (keys == null || typeof keys?.[Symbol.iterator] !== "function") {
        entries = DEFAULT_CACHE_KEYS;
    } else if (typeof keys === "string") {
        entries = keys;
    } else if (Array.isArray(keys)) {
        entries = keys;
    } else {
        entries = toArrayFromIterable(keys);
    }

    const normalized = normalizeStringList(entries, { allowInvalidType: true });

    return normalized.length > 0 ? normalized : [...DEFAULT_CACHE_KEYS];
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
        const previous = store.get(normalized) ?? 0;
        store.set(normalized, previous + amount);
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
 * @returns {{
 *   category: string,
 *   timeSync: <T>(label: string, callback: () => T) => T,
 *   timeAsync: <T>(label: string, callback: () => Promise<T>) => Promise<T>,
 *   startTimer: (label: string) => () => void,
 *   incrementCounter: (label: string, amount?: number) => void,
 *   recordCacheHit: (cacheName: string) => void,
 *   recordCacheMiss: (cacheName: string) => void,
 *   recordCacheStale: (cacheName: string) => void,
 *   recordCacheMetric: (cacheName: string, key: string, amount?: number) => void,
 *   snapshot: (extra?: object) => {
 *     category: string,
 *     totalTimeMs: number,
 *     timings: Record<string, number>,
 *     counters: Record<string, number>,
 *     caches: Record<string, Record<string, number>>,
 *     metadata: Record<string, unknown>
 *   },
 *   finalize: (extra?: object) => {
 *     category: string,
 *     totalTimeMs: number,
 *     timings: Record<string, number>,
 *     counters: Record<string, number>,
 *     caches: Record<string, Record<string, number>>,
 *     metadata: Record<string, unknown>
 *   },
 *   logSummary: (message?: string, extra?: object) => void,
 *   setMetadata: (key: string, value: unknown) => void
 * }}
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

    return {
        category,
        timeSync,
        timeAsync,
        startTimer,
        incrementCounter,
        recordCacheHit(cacheName) {
            recordCacheEvent(cacheName, "hits");
        },
        recordCacheMiss(cacheName) {
            recordCacheEvent(cacheName, "misses");
        },
        recordCacheStale(cacheName) {
            recordCacheEvent(cacheName, "stale");
        },
        recordCacheMetric(cacheName, key, amount = 1) {
            recordCacheEvent(cacheName, key, amount);
        },
        snapshot,
        finalize,
        logSummary,
        setMetadata
    };
}
