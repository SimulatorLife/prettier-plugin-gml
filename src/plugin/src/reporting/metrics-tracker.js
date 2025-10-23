import { getNonEmptyString } from "../../../shared/string-utils.js";
import { getOrCreateMapEntry } from "../../../shared/object-utils.js";

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
    const candidates =
        Array.isArray(keys) || typeof keys?.[Symbol.iterator] === "function"
            ? keys
            : DEFAULT_CACHE_KEYS;

    const labels = new Set();

    for (const candidate of candidates) {
        const label = getNonEmptyString(candidate)?.trim();
        if (label) {
            labels.add(label);
        }
    }

    return labels.size > 0 ? Array.from(labels) : [...DEFAULT_CACHE_KEYS];
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

function createCacheStatsEnsurer(caches, cacheKeys) {
    return (cacheName) => {
        const normalized = normalizeLabel(cacheName);
        return getOrCreateMapEntry(
            caches,
            normalized,
            () => new Map(cacheKeys.map((key) => [key, 0]))
        );
    };
}

function recordCacheIncrement(ensureCacheStats, cacheName, key, amount = 1) {
    const stats = ensureCacheStats(cacheName);
    const normalizedKey = normalizeLabel(key);
    const previous = getOrCreateMapEntry(stats, normalizedKey, () => 0);
    const increment = normalizeIncrementAmount(
        amount,
        amount === undefined ? 1 : 0
    );
    if (increment === 0) {
        return;
    }

    stats.set(normalizedKey, previous + increment);
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

function createFinalizer({ autoLog, logger, category, snapshot }) {
    const hasDebug = typeof logger?.debug === "function";

    return (extra = {}) => {
        const report = snapshot(extra);
        if (autoLog && hasDebug) {
            logger.debug(`[${category}] summary`, report);
        }

        return report;
    };
}

/**
 * Build a metrics collector tailored to a specific reporting category.
 *
 * The tracker records timing samples, counter increments, cache hit/miss
 * metrics, and arbitrary metadata. Callers can optionally provide a
 * `logger.debug` implementation to receive structured summary logs either
 * on-demand (via the returned `logSummary` helper) or automatically when
 * `finalize` runs and the `autoLog` option is enabled.
 *
 * Cache statistics default to tracking `hits`, `misses`, and `stale` entries.
 * Supplying `options.cacheKeys` expands that schema while still ensuring each
 * cache starts with zeroed counters for the configured labels.
 *
 * @param {object} [options]
 * @param {string} [options.category="metrics"] Identifier included in emitted
 *        summaries and log messages.
 * @param {{ debug?: (message: string, payload: object) => void } | null}
 *        [options.logger] Logger receiving summary output. When omitted or
 *        lacking a `debug` method, logging helpers become no-ops.
 * @param {boolean} [options.autoLog=false] When `true`, the tracker emits a
 *        summary through `logger.debug` when `finalize` is invoked.
 * @param {Iterable<string> | Array<string> | null | undefined}
 *        [options.cacheKeys] Custom cache metric labels to initialize for each
 *        cache. Falsy values fall back to the default trio.
 * @returns {{
 *     category: string;
 *     timeSync: (label: string, callback: () => unknown) => unknown;
 *     timeAsync: (label: string, callback: () => Promise<unknown>) => Promise<unknown>;
 *     startTimer: (label: string) => () => void;
 *     incrementCounter: (label: string, amount?: number) => void;
 *     recordCacheHit: (cacheName: string) => void;
 *     recordCacheMiss: (cacheName: string) => void;
 *     recordCacheStale: (cacheName: string) => void;
 *     recordCacheMetric: (cacheName: string, key: string, amount?: number) => void;
 *     snapshot: (extra?: object) => object;
 *     finalize: (extra?: object) => object;
 *     logSummary: (message?: string, extra?: object) => void;
 *     setMetadata: (key: string, value: unknown) => void;
 * }} Interface for recording and retrieving metrics.
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

    const incrementTiming = createMapIncrementer(timings);
    const incrementCounterBy = createMapIncrementer(counters);
    const ensureCacheStats = createCacheStatsEnsurer(caches, cacheKeys);
    const snapshot = createSnapshotFactory({
        category,
        startTime,
        timings,
        counters,
        caches,
        metadata
    });
    const logSummary = createSummaryLogger({ logger, category, snapshot });
    const finalize = createFinalizer({ autoLog, logger, category, snapshot });

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

    function recordCacheEvent(cacheName, key, amount = 1) {
        recordCacheIncrement(ensureCacheStats, cacheName, key, amount);
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
