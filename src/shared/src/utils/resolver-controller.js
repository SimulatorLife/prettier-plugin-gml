import { assertFunction } from "./object.js";

/**
 * Create a controller for managing optional resolver hooks that customize how
 * option maps or normalization behaviour are derived. The controller tracks the
 * active resolver, provides a canonical resolve function, and exposes helpers to
 * register or restore the resolver while keeping the surrounding modules
 * focused on their domain-specific logic.
 *
 * @template TOptions
 * @template TResult
 * @param {{
 *     name?: string,
 *     errorMessage?: string,
 *     defaultFactory: () => TResult,
 *     invoke?: (
 *         resolver: (...args: Array<unknown>) => unknown,
 *         options: TOptions,
 *         currentValue: TResult
 *     ) => unknown,
 *     normalize?: (
 *         result: unknown,
 *         options: TOptions,
 *         currentValue: TResult
 *     ) => TResult
 * }} config
 */
export function createResolverController({
    name = "resolver",
    errorMessage,
    defaultFactory,
    invoke = (resolver, options) => resolver(options),
    normalize = (result) => /** @type {TResult} */ (result)
}) {
    if (typeof defaultFactory !== "function") {
        throw new TypeError("defaultFactory must be a function.");
    }

    /** @type {((options: TOptions) => unknown) | null} */
    let resolver = null;
    /** @type {TResult} */
    let currentValue = defaultFactory();

    /**
     * Resolve the current value, applying the resolver when present and
     * normalizing the result through the configured hook.
     *
     * @param {TOptions} [options]
     * @returns {TResult}
     */
    function resolve(options = /** @type {TOptions} */ ({})) {
        if (!resolver) {
            currentValue = defaultFactory();
            return currentValue;
        }

        const rawResult = invoke(resolver, options, currentValue);
        const normalized = normalize(rawResult, options, currentValue);
        currentValue = normalized;
        return normalized;
    }

    /**
     * Register a new resolver, ensuring it is callable before storing it, and
     * immediately compute the resolved value.
     *
     * @param {unknown} candidate
     * @returns {TResult}
     */
    function set(candidate) {
        resolver = assertFunction(candidate, name, { errorMessage });
        return resolve();
    }

    /**
     * Restore the controller to its default state, clearing any active resolver
     * and reinitializing the cached value from the factory.
     *
     * @returns {TResult}
     */
    function restore() {
        resolver = null;
        currentValue = defaultFactory();
        return currentValue;
    }

    return {
        resolve,
        set,
        restore
    };
}
