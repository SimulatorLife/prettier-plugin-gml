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
import { hasMethod } from "./validation-utils.js";

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
    async getSymbolOccurrences(symbolName: string): Promise<Array<SymbolOccurrence>> {
        if (!this.config.enabled) {
            return this.fetchSymbolOccurrences(symbolName);
        }

        const cached = this.getCached(this.occurrenceCache, symbolName);
        if (cached !== null) {
            this.stats.hits++;
            return cached;
        }

        this.stats.misses++;
        const result = await this.fetchSymbolOccurrences(symbolName);
        this.setCached(this.occurrenceCache, symbolName, result);
        return result;
    }

    /**
     * Get symbols defined in a file, using cached results if available.
     */
    async getFileSymbols(filePath: string): Promise<Array<FileSymbol>> {
        if (!this.config.enabled) {
            return this.fetchFileSymbols(filePath);
        }

        const cached = this.getCached(this.fileSymbolsCache, filePath);
        if (cached !== null) {
            this.stats.hits++;
            return cached;
        }

        this.stats.misses++;
        const result = await this.fetchFileSymbols(filePath);
        this.setCached(this.fileSymbolsCache, filePath, result);
        return result;
    }

    /**
     * Get symbols that depend on the given symbols, using cached results if available.
     */
    async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
        if (symbolIds.length === 0) {
            return [];
        }

        if (!this.config.enabled) {
            return this.fetchDependents(symbolIds);
        }

        // Use sorted, joined symbolIds as cache key to ensure consistent lookup
        const cacheKey = [...symbolIds].toSorted().join(",");
        const cached = this.getCached(this.dependentsCache, cacheKey);
        if (cached !== null) {
            this.stats.hits++;
            return cached;
        }

        this.stats.misses++;
        const result = await this.fetchDependents(symbolIds);
        this.setCached(this.dependentsCache, cacheKey, result);
        return result;
    }

    /**
     * Check if a symbol exists, using cached results if available.
     */
    async hasSymbol(symbolId: string): Promise<boolean> {
        if (!this.config.enabled) {
            return this.fetchHasSymbol(symbolId);
        }

        const cached = this.getCached(this.existenceCache, symbolId);
        if (cached !== null) {
            this.stats.hits++;
            return cached;
        }

        this.stats.misses++;
        const result = await this.fetchHasSymbol(symbolId);
        this.setCached(this.existenceCache, symbolId, result);
        return result;
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
        if (!this.semantic || !hasMethod(this.semantic, "getSymbolOccurrences")) {
            return Promise.resolve([]);
        }

        return Promise.resolve(this.semantic.getSymbolOccurrences(symbolName));
    }

    /**
     * Fetch file symbols from the semantic analyzer.
     * @private
     */
    private async fetchFileSymbols(filePath: string): Promise<Array<FileSymbol>> {
        if (!this.semantic || !hasMethod(this.semantic, "getFileSymbols")) {
            return [];
        }
        return (await this.semantic.getFileSymbols(filePath)) ?? [];
    }

    /**
     * Fetch dependents from the semantic analyzer.
     * @private
     */
    private async fetchDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
        if (!this.semantic || !hasMethod(this.semantic, "getDependents")) {
            return [];
        }
        return (await this.semantic.getDependents(symbolIds)) ?? [];
    }

    /**
     * Check symbol existence via the semantic analyzer.
     * @private
     */
    private fetchHasSymbol(symbolId: string): Promise<boolean> {
        if (!this.semantic || !hasMethod(this.semantic, "hasSymbol")) {
            return Promise.resolve(true);
        }
        return Promise.resolve(this.semantic.hasSymbol(symbolId));
    }
}
