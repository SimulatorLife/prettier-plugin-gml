/**
 * Rename validation cache for the refactor engine.
 * Caches validation results to optimize interactive rename workflows where
 * the same symbol-to-name combinations are validated repeatedly (e.g., as
 * users type new names in IDE rename dialogs).
 */

import type { ValidationSummary, HotReloadSafetySummary } from "./types.js";

/**
 * Configuration for the rename validation cache.
 */
export interface RenameValidationCacheConfig {
    /**
     * Maximum number of cached validation results.
     * When exceeded, oldest entries are evicted (FIFO).
     * @default 50
     */
    maxSize?: number;

    /**
     * Time-to-live for cache entries in milliseconds.
     * Entries older than this are considered stale and evicted.
     * @default 30000 (30 seconds)
     */
    ttlMs?: number;

    /**
     * Enable or disable caching globally.
     * @default true
     */
    enabled?: boolean;
}

/**
 * Extended validation summary that includes hot reload metadata.
 */
export interface CachedValidationResult extends ValidationSummary {
    symbolName?: string;
    occurrenceCount?: number;
    hotReload?: HotReloadSafetySummary;
}

/**
 * Cache entry metadata.
 */
interface CacheEntry {
    result: CachedValidationResult;
    timestamp: number;
}

/**
 * Performance statistics for the cache.
 */
export interface ValidationCacheStats {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
}

/**
 * Cache for rename validation results.
 *
 * During interactive rename sessions (e.g., IDE rename dialogs), the same
 * symbol-to-name combination is often validated repeatedly as users type.
 * This cache reduces redundant semantic queries and conflict detection,
 * providing faster feedback for IDE integrations.
 *
 * @example
 * ```typescript
 * const cache = new RenameValidationCache({ maxSize: 50, ttlMs: 30000 });
 *
 * // First call: performs full validation
 * const result1 = await cache.getOrCompute(
 *   "gml/script/scr_player",
 *   "scr_hero",
 *   async () => engine.validateRenameRequest({ symbolId: "gml/script/scr_player", newName: "scr_hero" })
 * );
 *
 * // Second call within TTL: returns cached result (no validation)
 * const result2 = await cache.getOrCompute(
 *   "gml/script/scr_player",
 *   "scr_hero",
 *   async () => engine.validateRenameRequest({ symbolId: "gml/script/scr_player", newName: "scr_hero" })
 * );
 *
 * // Clear cache when source files change
 * cache.invalidateAll();
 * ```
 */
export class RenameValidationCache {
    private readonly cache: Map<string, CacheEntry>;
    private readonly maxSize: number;
    private readonly ttlMs: number;
    private readonly enabled: boolean;
    private stats: ValidationCacheStats;

    constructor(config: RenameValidationCacheConfig = {}) {
        this.cache = new Map();
        this.maxSize = config.maxSize ?? 50;
        this.ttlMs = config.ttlMs ?? 30_000;
        this.enabled = config.enabled ?? true;
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            size: 0
        };
    }

    /**
     * Generate a cache key from symbol ID and new name.
     */
    private getCacheKey(symbolId: string, newName: string): string {
        return `${symbolId}::${newName}`;
    }

    /**
     * Check if a cache entry is still valid based on TTL.
     */
    private isEntryValid(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp < this.ttlMs;
    }

    /**
     * Evict oldest entry when cache is full (FIFO eviction).
     */
    private evictOldest(): void {
        if (this.cache.size === 0) {
            return;
        }

        // Find the entry with the oldest timestamp
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey !== null) {
            this.cache.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    /**
     * Get or compute a validation result.
     * If a valid cached result exists, return it immediately.
     * Otherwise, compute the result using the provided function and cache it.
     *
     * @param symbolId - Symbol being renamed
     * @param newName - Proposed new name
     * @param compute - Function to compute validation if not cached
     * @returns Cached or computed validation result
     */
    async getOrCompute(
        symbolId: string,
        newName: string,
        compute: () => Promise<CachedValidationResult>
    ): Promise<CachedValidationResult> {
        if (!this.enabled) {
            return compute();
        }

        const key = this.getCacheKey(symbolId, newName);
        const cached = this.cache.get(key);

        // Return cached result if valid
        if (cached && this.isEntryValid(cached)) {
            this.stats.hits++;
            return cached.result;
        }

        // Cache miss - compute and store
        this.stats.misses++;

        // Remove stale entry if it exists
        if (cached) {
            this.cache.delete(key);
        }

        const result = await compute();

        // Store in cache with current timestamp
        const entry: CacheEntry = {
            result,
            timestamp: Date.now()
        };

        // Evict oldest if at capacity (check before adding)
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }

        // Only add if there's room (maxSize > 0)
        if (this.maxSize > 0) {
            this.cache.set(key, entry);
        } else {
            // maxSize is 0, so we evict immediately
            this.stats.evictions++;
        }

        this.stats.size = this.cache.size;

        return result;
    }

    /**
     * Invalidate cached validation for a specific symbol-name pair.
     *
     * @param symbolId - Symbol being renamed
     * @param newName - Proposed new name
     */
    invalidate(symbolId: string, newName: string): void {
        const key = this.getCacheKey(symbolId, newName);
        this.cache.delete(key);
        this.stats.size = this.cache.size;
    }

    /**
     * Invalidate all cached validation results for a specific symbol.
     * Useful when a symbol's definition or dependencies change.
     *
     * @param symbolId - Symbol whose validation results should be cleared
     */
    invalidateSymbol(symbolId: string): void {
        const prefix = `${symbolId}::`;
        const keysToDelete: Array<string> = [];

        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.cache.delete(key);
        }

        this.stats.size = this.cache.size;
    }

    /**
     * Clear all cached validation results.
     * Should be called when source files change to prevent stale results.
     */
    invalidateAll(): void {
        this.cache.clear();
        this.stats.size = 0;
    }

    /**
     * Get cache performance statistics.
     *
     * @returns Current cache statistics
     */
    getStats(): Readonly<ValidationCacheStats> {
        return Object.freeze({ ...this.stats });
    }

    /**
     * Reset cache performance counters.
     */
    resetStats(): void {
        this.stats.hits = 0;
        this.stats.misses = 0;
        this.stats.evictions = 0;
        this.stats.size = this.cache.size;
    }
}
