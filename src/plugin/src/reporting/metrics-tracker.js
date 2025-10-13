const hasHrtime = typeof process?.hrtime?.bigint === "function";

function nowMs() {
    if (hasHrtime) {
        const ns = process.hrtime.bigint();
        return Number(ns / 1000000n);
    }
    return Date.now();
}

function normalizeLabel(label) {
    return typeof label === "string" && label.length > 0 ? label : "unknown";
}

function mergeObjectEntries(target, source) {
    if (!source || typeof source !== "object") {
        return;
    }

    for (const [key, value] of Object.entries(source)) {
        target[key] = value;
    }
}

const DEFAULT_CACHE_KEYS = ["hits", "misses", "stale"];

function toPlainObject(map) {
    return Object.fromEntries(map);
}

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

        if (extra && typeof extra === "object") {
            mergeObjectEntries(summary.timings, extra.timings);
            mergeObjectEntries(summary.counters, extra.counters);
            mergeObjectEntries(summary.caches, extra.caches);
            if (extra.metadata) {
                mergeObjectEntries(summary.metadata, extra.metadata);
            }
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
        if (typeof key !== "string" || key.length === 0) {
            return;
        }
        metadata[key] = value;
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
