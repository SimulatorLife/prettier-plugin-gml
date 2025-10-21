import { assertFunction, hasOwn, isObjectLike } from "./object.js";

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
    assertFunction(computeValue, "computeValue");

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

export { getCachedValue };
