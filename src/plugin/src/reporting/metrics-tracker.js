import { getNonEmptyString } from "../../../shared/string-utils.js";

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

const DEFAULT_CACHE_KEYS = ["hits", "misses", "stale"];

function toPlainObject(map) {
    return Object.fromEntries(map);
}

/**
 * Factory for lightweight timing/counter helpers used when collecting
 * formatter diagnostics. The tracker keeps per-label aggregates instead of
 * individual samples so callers can incrementally feed it event data without
 * worrying about memory growth.
 *
 * Timings and counters default to zero and may be incremented even when no
 * prior value exists; cache statistics are pre-seeded with "hits", "misses",
 * and "stale" counters so downstream reporters can assume each key is present.
 *
 * @param {{
 *     category?: string,
 *     logger?: { debug?: (message: string, payload: any) => void } | null,
 *     autoLog?: boolean
 * } | undefined} [options] Optional configuration. `category` prefixes log
 *     messages, `logger` supplies a debug sink (only its `debug` method is
 *     used), and `autoLog` controls whether {@link finalize} emits a summary
 *     automatically.
 * @returns {{
 *     category: string,
 *     timeSync: <T>(label: string, callback: () => T) => T,
 *     timeAsync: <T>(label: string, callback: () => Promise<T>) => Promise<T>,
 *     startTimer: (label: string) => () => void,
 *     incrementCounter: (label: string, amount?: number) => void,
 *     recordCacheHit: (cacheName: string) => void,
 *     recordCacheMiss: (cacheName: string) => void,
 *     recordCacheStale: (cacheName: string) => void,
 *     snapshot: (extra?: Record<string, unknown>) => Record<string, unknown>,
 *     finalize: (extra?: Record<string, unknown>) => Record<string, unknown>,
 *     logSummary: (message?: string, extra?: Record<string, unknown>) => void,
 *     setMetadata: (key: unknown, value: unknown) => void
 * }} A reusable tracker instance. None of the helpers throw when labels are
 *     blank; instead they coerce to "unknown" so instrumentation can be wired
 *     inline with minimal guard code.
 */
export function createMetricsTracker({
    category = "metrics",
    logger = null,
    autoLog = false
} = {}) {
    const startTime = nowMs();
    const timings = new Map();
    const counters = new Map();
    const caches = new Map();
    const metadata = Object.create(null);

    function incrementMapCounter(store, label, amount = 1) {
        const normalized = normalizeLabel(label);
        const previous = store.get(normalized) ?? 0;
        store.set(normalized, previous + amount);
    }

    function ensureCacheStats(cacheName) {
        const normalized = normalizeLabel(cacheName);
        let cacheStats = caches.get(normalized);
        if (!cacheStats) {
            cacheStats = new Map(DEFAULT_CACHE_KEYS.map((key) => [key, 0]));
            caches.set(normalized, cacheStats);
        }
        return cacheStats;
    }

    function recordTiming(label, durationMs) {
        incrementMapCounter(timings, label, Math.max(0, durationMs));
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
        incrementMapCounter(counters, label, amount);
    }

    function recordCacheEvent(cacheName, key) {
        const stats = ensureCacheStats(cacheName);
        stats.set(key, (stats.get(key) ?? 0) + 1);
    }

    function snapshot(extra = {}) {
        const endTime = nowMs();
        const summary = {
            category,
            totalTimeMs: endTime - startTime,
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

        const {
            timings: extraTimings,
            counters: extraCounters,
            caches: extraCaches,
            metadata: extraMetadata
        } = extra;

        if (extraTimings && typeof extraTimings === "object") {
            Object.assign(summary.timings, extraTimings);
        }

        if (extraCounters && typeof extraCounters === "object") {
            Object.assign(summary.counters, extraCounters);
        }

        if (extraCaches && typeof extraCaches === "object") {
            Object.assign(summary.caches, extraCaches);
        }

        if (extraMetadata && typeof extraMetadata === "object") {
            Object.assign(summary.metadata, extraMetadata);
        }

        return summary;
    }

    function logSummary(message = "summary", extra = {}) {
        if (!logger || typeof logger.debug !== "function") {
            return;
        }
        logger.debug(`[${category}] ${message}`, snapshot(extra));
    }

    function finalize(extra = {}) {
        const report = snapshot(extra);
        if (autoLog && logger && typeof logger.debug === "function") {
            logger.debug(`[${category}] summary`, report);
        }
        return report;
    }

    function setMetadata(key, value) {
        const normalizedKey = getNonEmptyString(key);
        if (!normalizedKey) {
            return;
        }
        metadata[normalizedKey] = value;
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
        snapshot,
        finalize,
        logSummary,
        setMetadata
    };
}
