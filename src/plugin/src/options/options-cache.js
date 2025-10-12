const hasOwnProperty = Object.prototype.hasOwnProperty;

function getCachedValue(options, cacheKey, fallbackCache, computeValue) {
    if (typeof computeValue !== "function") {
        throw new TypeError("computeValue must be a function");
    }

    if (!options || typeof options !== "object") {
        return computeValue();
    }

    if (hasOwnProperty.call(options, cacheKey)) {
        return options[cacheKey];
    }

    if (
        fallbackCache &&
        typeof fallbackCache.has === "function" &&
        typeof fallbackCache.get === "function" &&
        fallbackCache.has(options)
    ) {
        return fallbackCache.get(options);
    }

    const computed = computeValue();

    if (Object.isExtensible(options)) {
        try {
            Object.defineProperty(options, cacheKey, {
                value: computed,
                configurable: false,
                enumerable: false,
                writable: false
            });
            return computed;
        } catch {
            // Ignore failures and fall back to the WeakMap path below.
        }
    }

    if (
        fallbackCache &&
        typeof fallbackCache.set === "function" &&
        typeof fallbackCache.has === "function"
    ) {
        fallbackCache.set(options, computed);
    }

    return computed;
}

export { getCachedValue };
