import { hasOwn, isObjectLike } from "../../../shared/object-utils.js";

const SHARED_CACHE = new WeakMap();

function isCacheLike(candidate) {
    return (
        candidate != undefined &&
        typeof candidate.get === "function" &&
        typeof candidate.set === "function"
    );
}

function defineCachedProperty(target, cacheKey, value) {
    if (cacheKey == undefined || !Object.isExtensible(target)) {
        return;
    }

    try {
        Object.defineProperty(target, cacheKey, {
            configurable: false,
            enumerable: false,
            writable: false,
            value
        });
    } catch {
        // Some callers supply frozen option objects or exotic proxies whose
        // property descriptors cannot be redefined. Treat those failures as a
        // signal to fall back to the shared WeakMap cache so we still memoize
        // results without mutating the original object or leaking the
        // underlying TypeError to callers that cannot action it.
    }
}

/**
 * Resolve a value derived from an options bag while memoizing the result on
 * either the options object itself or a shared fallback cache. The helper
 * intentionally accepts loose inputs so callers in the printers and parsers can
 * forward whatever configuration objects they receive without pre-validating
 * them.
 *
 * @template TValue
 * @param {unknown} options Options object that may already contain the cached
 *   entry.
 * @param {PropertyKey | null | undefined} cacheKey Property name used to stash
 *   the computed value directly on {@link options}. When omitted the
 *   computation is memoized exclusively via the fallback cache.
 * @param {{
 *   get(key: unknown): TValue | undefined,
 *   set(key: unknown, value: TValue): unknown
 * } | null | undefined} fallbackCache
 *   Map-like cache used when the options object cannot hold the computed value
 *   (for example when the object is frozen or the caller opts out of
 *   `cacheKey`). Any value with synchronous `get`/`set` methods is accepted.
 * @param {() => TValue} computeValue Function invoked to produce the value when
 *   a cached result is unavailable.
 * @returns {TValue} The cached or freshly computed value.
 */
function getCachedValue(options, cacheKey, fallbackCache, computeValue) {
    if (typeof computeValue !== "function") {
        throw new TypeError("computeValue must be a function");
    }

    if (!isObjectLike(options)) {
        return computeValue();
    }

    if (cacheKey != undefined && hasOwn(options, cacheKey)) {
        return options[cacheKey];
    }

    const cache = isCacheLike(fallbackCache) ? fallbackCache : SHARED_CACHE;
    if (cache.has(options)) {
        return cache.get(options);
    }

    const computed = computeValue();

    defineCachedProperty(options, cacheKey, computed);
    cache.set(options, computed);
    return computed;
}

/**
 * Factory that yields a resolver function wired to a specific cache strategy.
 * Each resolver memoizes the derived value per options object, ensuring we only
 * run the expensive `compute` callback once for any given configuration. This
 * mirrors the caching pattern used throughout the plugin when normalizing user
 * supplied options.
 *
 * @template TValue
 * @param {Object} [options]
 * @param {PropertyKey | null} [options.cacheKey=null] Optional property name to
 *   store the computed value on the options object. When omitted, results are
 *   memoized solely via the fallback cache.
 * @param {{
 *   get(key: unknown): TValue | undefined,
 *   set(key: unknown, value: TValue): unknown
 * } | undefined} [options.cache]
 *   Pre-existing cache store to use instead of creating a new WeakMap.
 * @param {(options: unknown) => TValue} options.compute Function invoked to
 *   compute the memoized value the first time each options object is
 *   encountered.
 * @returns {(options: unknown) => TValue} Resolver that returns a cached value
 *   for the provided options bag.
 */
function createCachedOptionResolver({ cacheKey = null, cache, compute } = {}) {
    if (typeof compute !== "function") {
        throw new TypeError("compute must be a function");
    }

    const fallbackCache = cache ?? new WeakMap();

    return function resolveCachedOption(options) {
        return getCachedValue(options, cacheKey, fallbackCache, () =>
            compute(options)
        );
    };
}

export { getCachedValue, createCachedOptionResolver };
