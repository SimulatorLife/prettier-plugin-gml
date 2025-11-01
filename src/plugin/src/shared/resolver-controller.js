import { assertFunction } from "@prettier-plugin-gml/shared/utils/object.js";

// Option resolver plumbing now lives alongside the plugin so shared bundles stay
// focused on cross-environment primitives. The implementation remains unchanged
// aside from importing its assertions from the shared object helpers.

/**
 * @template TOptions
 * @template TResult
 * @typedef {object} ResolverResolution
 * @property {(options?: TOptions) => TResult} resolve
 */

/**
 * @template TOptions
 * @template TResult
 * @typedef {object} ResolverRegistry
 * @property {(candidate: unknown) => TResult} set
 * @property {() => TResult} restore
 */

/**
 * @template TOptions
 * @template TResult
 * @typedef {object} ResolverControls
 * @property {ResolverResolution<TOptions, TResult>} resolution
 * @property {ResolverRegistry<TOptions, TResult>} registry
 */

/**
 * Create a controller for managing optional resolver hooks that customize how
 * option maps or normalization behaviour are derived. The controller tracks the
 * active resolver but now exposes narrow resolution and registry views so
 * collaborators depend only on the helpers they consume. The resolution view
 * focuses on producing the current value, while the registry view owns
 * registration and reset concerns.
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
 *     ) => TResult,
 *     reuseDefaultValue?: boolean
 * }} config
 * @returns {ResolverControls<TOptions, TResult>}
 */
export function createResolverController({
    name = "resolver",
    errorMessage,
    defaultFactory,
    invoke = (resolver, options) => resolver(options),
    normalize = (result) => /** @type {TResult} */ (result),
    reuseDefaultValue = false
}) {
    if (typeof defaultFactory !== "function") {
        throw new TypeError("defaultFactory must be a function.");
    }

    /** @type {((options: TOptions) => unknown) | null} */
    let resolver = null;
    /** @type {TResult} */
    let currentValue = defaultFactory();

    function resetToDefault() {
        currentValue = defaultFactory();
        return currentValue;
    }

    /**
     * Resolve the current value, applying the resolver when present and
     * normalizing the result through the configured hook.
     *
     * @param {TOptions} [options]
     * @returns {TResult}
     */
    function resolve(options = /** @type {TOptions} */ ({})) {
        if (!resolver) {
            if (!reuseDefaultValue) {
                return resetToDefault();
            }

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
        return resetToDefault();
    }

    const resolution = Object.freeze({ resolve });
    const registry = Object.freeze({ set, restore });

    return Object.freeze({ resolution, registry });
}
