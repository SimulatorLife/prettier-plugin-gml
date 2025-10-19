import { getNonEmptyString } from "../string-utils.js";
import { getOrCreateMapEntry } from "../object-utils.js";

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
const SUMMARY_SECTIONS = ["timings", "counters", "caches", "metadata"];

function toKeyIterable(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (value && typeof value[Symbol.iterator] === "function") {
        return [...value];
    }

    return [];
}

function normalizeCacheKeys(keys) {
    const candidates = keys ?? DEFAULT_CACHE_KEYS;
    const normalized = [];
    const seen = new Set();

    for (const candidate of toKeyIterable(candidates)) {
        const label = getNonEmptyString(candidate);
        if (!label) {
            continue;
        }

        const trimmed = label.trim();
        if (trimmed.length === 0) {
            continue;
        }

        if (seen.has(trimmed)) {
            continue;
        }

        seen.add(trimmed);
        normalized.push(trimmed);
    }

    if (normalized.length === 0) {
        return [...DEFAULT_CACHE_KEYS];
    }

    return normalized;
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

    function incrementMapCounter(store, label, amount = 1) {
        const normalized = normalizeLabel(label);
        const previous = store.get(normalized) ?? 0;
        store.set(normalized, previous + amount);
    }

    function ensureCacheStats(cacheName) {
        const normalized = normalizeLabel(cacheName);
        return getOrCreateMapEntry(caches, normalized, () =>
            new Map(cacheKeys.map((key) => [key, 0]))
        );
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

    function recordCacheEvent(cacheName, key, amount = 1) {
        const stats = ensureCacheStats(cacheName);
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

        if (!extra || typeof extra !== "object") {
            return summary;
        }

        mergeSummarySections(summary, extra);
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
        recordCacheMetric(cacheName, key, amount = 1) {
            recordCacheEvent(cacheName, key, amount);
        },
        snapshot,
        finalize,
        logSummary,
        setMetadata
    };
}
