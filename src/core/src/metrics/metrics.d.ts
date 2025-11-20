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
 * @returns {MetricsContracts}
 */
export declare function createMetricsTracker({
    category,
    logger,
    autoLog,
    cacheKeys: cacheKeyOption
}?: {
    category?: string;
    logger?: any;
    autoLog?: boolean;
}): Readonly<{
    recording: Readonly<{
        category: string;
        timers: Readonly<{
            startTimer: (label: any) => () => void;
            timeSync: (label: any, callback: any) => any;
            timeAsync: (label: any, callback: any) => Promise<any>;
        }>;
        counters: Readonly<{
            increment: (label: any, amount?: number) => void;
        }>;
        caches: Readonly<{
            recordHit(cacheName: any): void;
            recordMiss(cacheName: any): void;
            recordStale(cacheName: any): void;
            recordMetric(cacheName: any, key: any, amount?: number): void;
        }>;
        metadata: Readonly<{
            setMetadata: (key: any, value: any) => void;
        }>;
    }>;
    reporting: Readonly<{
        summary: Readonly<{
            snapshot: (extra?: {}) => {
                category: string;
                totalTimeMs: unknown;
                timings: any;
                counters: any;
                caches: any;
                metadata: any;
            };
            finalize: (extra?: {}) => any;
        }>;
        caches: Readonly<{
            cachesSnapshot: (extra: any) => any;
            cacheSnapshot: (cacheName: any, extra: any) => any;
        }>;
        logger: Readonly<{
            logSummary: (message?: string, extra?: {}) => void;
        }>;
    }>;
}>;
