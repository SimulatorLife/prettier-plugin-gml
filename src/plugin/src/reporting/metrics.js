import {
    getNonEmptyString,
    normalizeStringList
} from "../../../shared/string-utils.js";
import { toArrayFromIterable } from "../../../shared/array-utils.js";

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
    const entries = toArrayFromIterable(keys ?? DEFAULT_CACHE_KEYS);

    if (entries.length === 0) {
        return [...DEFAULT_CACHE_KEYS];
    }

    const normalized = normalizeStringList(entries, {
        splitPattern: null,
        allowInvalidType: true
    });

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

    const debug =
        typeof logger?.debug === "function" ? logger.debug.bind(logger) : null;

    function incrementMap(store, label, amount = 1) {
        const normalized = normalizeLabel(label);
        const previous = store.get(normalized) ?? 0;
        store.set(normalized, previous + amount);
    }

    function ensureCacheStats(cacheName) {
        const normalized = normalizeLabel(cacheName);
        let stats = caches.get(normalized);
        if (!stats) {
            stats = new Map(cacheKeys.map((key) => [key, 0]));
            caches.set(normalized, stats);
        }
        return stats;
    }

    function adjustCacheMetric(cacheName, key, amount) {
        const stats = ensureCacheStats(cacheName);
        const normalizedKey = normalizeLabel(key);
        const increment = normalizeIncrementAmount(
            amount,
            amount === undefined ? 1 : 0
        );
        const previous = stats.get(normalizedKey);

        if (previous === undefined) {
            // Lazily seed unknown keys so the hot path only performs a single
            // map lookup. This mirrors the previous semantics that created the
            // entry even when the increment was `0`.
            if (increment === 0) {
                stats.set(normalizedKey, 0);
                return;
            }

            stats.set(normalizedKey, increment);
            return;
        }

        if (increment === 0) {
            return;
        }

        stats.set(normalizedKey, previous + increment);
    }

    function snapshot(extra = {}) {
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

        if (extra && typeof extra === "object") {
            for (const key of SUMMARY_SECTIONS) {
                const additions = extra[key];
                if (additions && typeof additions === "object") {
                    summary[key] = { ...summary[key], ...additions };
                }
            }
        }

        return summary;
    }

    function logSummary(message = "summary", extra = {}) {
        if (!debug) {
            return;
        }

        debug(`[${category}] ${message}`, snapshot(extra));
    }

    function finalize(extra = {}) {
        const report = snapshot(extra);
        if (autoLog && debug) {
            debug(`[${category}] summary`, report);
        }
        return report;
    }

    function recordTiming(label, durationMs) {
        incrementMap(timings, label, Math.max(0, durationMs));
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
        incrementMap(counters, label, amount);
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
            adjustCacheMetric(cacheName, "hits");
        },
        recordCacheMiss(cacheName) {
            adjustCacheMetric(cacheName, "misses");
        },
        recordCacheStale(cacheName) {
            adjustCacheMetric(cacheName, "stale");
        },
        recordCacheMetric(cacheName, key, amount = 1) {
            adjustCacheMetric(cacheName, key, amount);
        },
        snapshot,
        finalize,
        logSummary,
        setMetadata
    };
}
