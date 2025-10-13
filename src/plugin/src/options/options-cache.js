import { isObjectLike } from "../../../shared/object-utils.js";

const hasOwnProperty = Object.prototype.hasOwnProperty;
const sharedCache = new WeakMap();

function getCacheStore(candidate) {
    if (
        candidate &&
        typeof candidate.get === "function" &&
        typeof candidate.set === "function"
    ) {
        return candidate;
    }

    return sharedCache;
}

function getCachedValue(options, cacheKey, fallbackCache, computeValue) {
    if (typeof computeValue !== "function") {
        throw new TypeError("computeValue must be a function");
    }

    if (!isObjectLike(options)) {
        return computeValue();
    }

    if (cacheKey != null && hasOwnProperty.call(options, cacheKey)) {
        return options[cacheKey];
    }

    const cache = getCacheStore(fallbackCache);
    if (cache.has(options)) {
        return cache.get(options);
    }

    const computed = computeValue();

    if (cacheKey != null && Object.isExtensible(options)) {
        try {
            Object.defineProperty(options, cacheKey, {
                configurable: false,
                enumerable: false,
                writable: false,
                value: computed
            });
        } catch {
            // ignore define failures and fall back to the cache store
        }
    }

    cache.set(options, computed);
    return computed;
}

export { getCachedValue };
