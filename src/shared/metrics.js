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

export function createMetricsTracker({
    category = "metrics",
    logger = null,
    autoLog = false
} = {}) {
    const startTime = nowMs();
    const timings = new Map();
    const counters = Object.create(null);
    const caches = Object.create(null);
    const metadata = Object.create(null);

    function recordTiming(label, durationMs) {
        const normalized = normalizeLabel(label);
        const previous = timings.get(normalized) ?? 0;
        timings.set(normalized, previous + Math.max(0, durationMs));
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
        const normalized = normalizeLabel(label);
        const previous = counters[normalized] ?? 0;
        counters[normalized] = previous + amount;
    }

    function recordCacheEvent(cacheName, key) {
        const normalized = normalizeLabel(cacheName);
        const existing = caches[normalized] ?? {
            hits: 0,
            misses: 0,
            stale: 0
        };
        existing[key] += 1;
        caches[normalized] = existing;
    }

    function snapshot(extra = {}) {
        const endTime = nowMs();
        const summary = {
            category,
            totalTimeMs: endTime - startTime,
            timings: Object.fromEntries(timings),
            counters: { ...counters },
            caches: Object.fromEntries(
                Object.entries(caches).map(([name, value]) => [
                    name,
                    { ...value }
                ])
            ),
            metadata: { ...metadata }
        };

        if (extra && typeof extra === "object") {
            if (extra.timings) {
                for (const [label, value] of Object.entries(extra.timings)) {
                    summary.timings[label] = value;
                }
            }
            if (extra.counters) {
                for (const [label, value] of Object.entries(extra.counters)) {
                    summary.counters[label] = value;
                }
            }
            if (extra.caches) {
                for (const [label, value] of Object.entries(extra.caches)) {
                    summary.caches[label] = value;
                }
            }
            if (extra.metadata) {
                Object.assign(summary.metadata, extra.metadata);
            }
        }

        return summary;
    }

    function logSummary(message = "summary", extra = {}) {
        if (!logger || typeof logger.debug !== "function") {
            return;
        }
        const report = snapshot(extra);
        logger.debug(`[${category}] ${message}`, report);
    }

    function finalize(extra = {}) {
        const report = snapshot(extra);
        if (autoLog) {
            logSummary("summary", extra);
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
