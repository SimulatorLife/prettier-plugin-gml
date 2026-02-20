/**
 * Caching layer for semantic analyzer queries during refactoring operations.
 *
 * During batch renames and impact analysis, the refactor engine often queries
 * the same semantic data repeatedly (e.g., symbol occurrences, dependencies,
 * file symbols). This cache layer optimizes those operations by memoizing
 * results within a refactoring session, reducing redundant semantic analysis.
 *
 * The cache is session-scoped and provides methods to clear stale entries
 * when the underlying source files change.
 */

import type { DependentSymbol, FileSymbol, PartialSemanticAnalyzer, SymbolOccurrence } from "./types.js";

/**
 * Cache entry with TTL tracking.
 */
interface CacheEntry<T> {
    value: T;
    timestamp: number;
}

/**
 * Configuration for the semantic query cache.
 */
export interface SemanticCacheConfig {
    /**
     * Maximum number of entries to store per cache type.
     * When exceeded, oldest entries are evicted (FIFO).
     * Default: 100
     */
    maxSize?: number;

    /**
     * Time-to-live for cached entries in milliseconds.
     * Entries older than this are considered stale.
     * Default: 60000 (1 minute)
     */
    ttlMs?: number;

    /**
     * Whether to enable the cache.
     * When false, all queries pass through to the semantic analyzer.
     * Default: true
     */
    enabled?: boolean;
}

/**
 * Statistics about cache performance.
 */
export interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
}

/**
 * Caching wrapper for semantic analyzer queries.
 *
 * Provides transparent caching of expensive semantic operations during
 * refactoring sessions. The cache is designed to be short-lived and scoped
 * to a single refactoring workflow (e.g., a batch rename operation).
 *
 * @example
 * ```typescript
 * const cache = new SemanticQueryCache(semantic, { maxSize: 50, ttlMs: 30000 });
 *
 * // First call queries semantic analyzer
 * const occurrences1 = await cache.getSymbolOccurrences("player_hp");
 *
 * // Second call returns cached result
 * const occurrences2 = await cache.getSymbolOccurrences("player_hp");
 *
 * // Clear cache when source changes
 * cache.invalidateAll();
 * ```
 */
export class SemanticQueryCache {
    private readonly semantic: PartialSemanticAnalyzer | null;
    private readonly config: Required<SemanticCacheConfig>;

    private occurrenceCache = new Map<string, CacheEntry<Array<SymbolOccurrence>>>();
    private fileSymbolsCache = new Map<string, CacheEntry<Array<FileSymbol>>>();
    private dependentsCache = new Map<string, CacheEntry<Array<DependentSymbol>>>();
    private existenceCache = new Map<string, CacheEntry<boolean>>();

    private stats = {
        hits: 0,
        misses: 0,
        evictions: 0
    };

    constructor(semantic: PartialSemanticAnalyzer | null, config: SemanticCacheConfig = {}) {
        this.semantic = semantic;
        this.config = {
            maxSize: config.maxSize ?? 100,
            ttlMs: config.ttlMs ?? 60_000,
            enabled: config.enabled ?? true
        };
    }

    /**
     * Get all occurrences of a symbol, using cached results if available.
     */
    getSymbolOccurrences(symbolName: string): Promise<Array<SymbolOccurrence>> {
        return this.queryWithCache(this.occurrenceCache, symbolName, (name) => this.fetchSymbolOccurrences(name));
    }

    /**
     * Get symbols defined in a file, using cached results if available.
     */
    getFileSymbols(filePath: string): Promise<Array<FileSymbol>> {
        return this.queryWithCache(this.fileSymbolsCache, filePath, (path) => this.fetchFileSymbols(path));
    }

    /**
     * Get symbols that depend on the given symbols, using cached results if available.
     */
    getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
        if (symbolIds.length === 0) {
            return Promise.resolve<Array<DependentSymbol>>([]);
        }

        // Use sorted, joined symbolIds as cache key to ensure consistent lookup regardless of input order.
        const cacheKey = [...symbolIds].toSorted().join(",");
        return this.queryWithCache(this.dependentsCache, cacheKey, () => this.fetchDependents(symbolIds));
    }

    /**
     * Check if a symbol exists, using cached results if available.
     */
    hasSymbol(symbolId: string): Promise<boolean> {
        return this.queryWithCache(this.existenceCache, symbolId, (id) => this.fetchHasSymbol(id));
    }

    /**
     * Batch query for file symbols across multiple files.
     * Optimized for hot reload scenarios where multiple files need to be queried at once.
     * Uses cache when possible and only fetches uncached files from the semantic analyzer.
     */
    async getFileSymbolsBatch(filePaths: ReadonlyArray<string>): Promise<Map<string, Array<FileSymbol>>> {
        const results = new Map<string, Array<FileSymbol>>();

        if (filePaths.length === 0) {
            return results;
        }

        const uncachedPaths: Array<string> = [];

        for (const filePath of filePaths) {
            if (!this.config.enabled) {
                uncachedPaths.push(filePath);
                continue;
            }

            const cached = this.getCached(this.fileSymbolsCache, filePath);
            if (cached === null) {
                uncachedPaths.push(filePath);
            } else {
                this.stats.hits++;
                results.set(filePath, cached);
            }
        }

        if (uncachedPaths.length > 0) {
            const fetchedResults = await Promise.all(
                uncachedPaths.map(async (filePath) => {
                    this.stats.misses++;
                    const symbols = await this.fetchFileSymbols(filePath);
                    if (this.config.enabled) {
                        this.setCached(this.fileSymbolsCache, filePath, symbols);
                    }
                    return { filePath, symbols };
                })
            );

            for (const { filePath, symbols } of fetchedResults) {
                results.set(filePath, symbols);
            }
        }

        return results;
    }

    /**
     * Invalidate all cached entries.
     * Should be called when source files change during a refactoring session.
     */
    invalidateAll(): void {
        this.occurrenceCache.clear();
        this.fileSymbolsCache.clear();
        this.dependentsCache.clear();
        this.existenceCache.clear();
    }

    /**
     * Invalidate cached entries for a specific file.
     * Useful when a file changes but others remain valid.
     */
    invalidateFile(filePath: string): void {
        const cachedSymbols = this.getCached(this.fileSymbolsCache, filePath);
        this.fileSymbolsCache.delete(filePath);

        if (cachedSymbols) {
            const symbolIds = new Set(cachedSymbols.map((symbol) => symbol.id));

            for (const symbolId of symbolIds) {
                this.existenceCache.delete(symbolId);
            }

            if (symbolIds.size > 0) {
                for (const key of this.dependentsCache.keys()) {
                    const dependencyIds = key.split(",");
                    if (dependencyIds.some((dependencyId) => symbolIds.has(dependencyId))) {
                        this.dependentsCache.delete(key);
                    }
                }
            }
        }

        // Clear occurrence cache entries that reference this file
        for (const [key, entry] of this.occurrenceCache.entries()) {
            if (entry.value.some((occ) => occ.path === filePath)) {
                this.occurrenceCache.delete(key);
            }
        }
    }

    /**
     * Get cache performance statistics.
     */
    getStats(): CacheStats {
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            evictions: this.stats.evictions,
            size:
                this.occurrenceCache.size +
                this.fileSymbolsCache.size +
                this.dependentsCache.size +
                this.existenceCache.size
        };
    }

    /**
     * Reset cache statistics.
     */
    resetStats(): void {
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Core cache-lookup/miss/store routine shared by all single-key query methods.
     *
     * When caching is disabled the fetch function is called directly.
     * When enabled, a cache hit increments `hits` and returns the stored value;
     * a miss increments `misses`, calls `fetch`, and stores the result.
     *
     * @private
     */
    private async queryWithCache<T>(
        cache: Map<string, CacheEntry<T>>,
        key: string,
        fetch: (key: string) => Promise<T>
    ): Promise<T> {
        if (!this.config.enabled) {
            return fetch(key);
        }

        const cached = this.getCached(cache, key);
        if (cached !== null) {
            this.stats.hits++;
            return cached;
        }

        this.stats.misses++;
        const result = await fetch(key);
        this.setCached(cache, key, result);
        return result;
    }

    /**
     * Get a cached value if it exists and hasn't expired.
     * @private
     */
    private getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
        const entry = cache.get(key);
        if (!entry) {
            return null;
        }

        const age = Date.now() - entry.timestamp;
        if (age > this.config.ttlMs) {
            cache.delete(key);
            return null;
        }

        return entry.value;
    }

    /**
     * Store a value in the cache with LRU eviction.
     * @private
     */
    private setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
        // Evict oldest entry if cache is full (simple FIFO, not true LRU)
        if (cache.size >= this.config.maxSize) {
            const firstKey = cache.keys().next().value as string | undefined;
            if (firstKey !== undefined) {
                cache.delete(firstKey);
                this.stats.evictions++;
            }
        }

        cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    /**
     * Fetch symbol occurrences from the semantic analyzer.
     * @private
     */
    private fetchSymbolOccurrences(symbolName: string): Promise<Array<SymbolOccurrence>> {
        if (!this.semantic?.getSymbolOccurrences) {
            return Promise.resolve([]);
        }

        return Promise.resolve(this.semantic.getSymbolOccurrences(symbolName));
    }

    /**
     * Fetch file symbols from the semantic analyzer.
     * @private
     */
    private async fetchFileSymbols(filePath: string): Promise<Array<FileSymbol>> {
        if (!this.semantic?.getFileSymbols) {
            return [];
        }
        return (await this.semantic.getFileSymbols(filePath)) ?? [];
    }

    /**
     * Fetch dependents from the semantic analyzer.
     * @private
     */
    private async fetchDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
        if (!this.semantic?.getDependents) {
            return [];
        }
        return (await this.semantic.getDependents(symbolIds)) ?? [];
    }

    /**
     * Check symbol existence via the semantic analyzer.
     * @private
     */
    private fetchHasSymbol(symbolId: string): Promise<boolean> {
        if (!this.semantic?.hasSymbol) {
            return Promise.resolve(true);
        }
        return Promise.resolve(this.semantic.hasSymbol(symbolId));
    }
}
