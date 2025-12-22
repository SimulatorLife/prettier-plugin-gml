import { assertFunction } from "./object.js";

type Resolver<TResult, TOptions> = (options?: TOptions) => TResult;

type Normalizer<TResult> = (value: TResult) => TResult;

/**
 * Configuration options for {@link createResolverController}.
 */
export interface ResolverControllerOptions<TResult, TOptions = unknown> {
    /**
     * Factory invoked when no custom resolver has been registered. The result
     * is cached so repeated `resolve` calls do not repeatedly invoke this
     * factory.
     */
    defaultFactory: Resolver<TResult, TOptions>;
    /**
     * Optional normalization hook that runs on every resolver value before it
     * is returned, keeping the controller consumer responsible for enforcing
     * invariants such as freezing or validating the result.
     */
    normalize?: Normalizer<TResult>;
}

/**
 * Handles resolution, normalization, and caching for configurable callbacks
 * that expose a default implementation.
 */
export interface ResolverController<TResult, TOptions = unknown> {
    /**
     * Resolve the currently registered callback, falling back to the default
     * factory when no custom resolver exists.
     */
    resolve(options?: TOptions): TResult;
    /**
     * Register a custom resolver that takes precedence over the default
     * factory.
     */
    set(resolver: Resolver<TResult, TOptions>): void;
    /**
     * Restore the controller to its original default state and return the
     * default value.
     */
    restore(): TResult;
}

export function createResolverController<TResult, TOptions = unknown>({
    defaultFactory,
    normalize
}: ResolverControllerOptions<TResult, TOptions>): ResolverController<
    TResult,
    TOptions
> {
    const produceDefault = assertFunction(
        defaultFactory,
        "defaultFactory"
    ) as Resolver<TResult, TOptions>;
    const normalizeResult: Normalizer<TResult> =
        normalize === undefined
            ? (((value) => value) as Normalizer<TResult>)
            : (assertFunction(normalize, "normalize") as Normalizer<TResult>);

    let cachedDefault: TResult;
    let hasCachedDefault = false;
    let customResolver: Resolver<TResult, TOptions> | null = null;

    const resolveDefault = (options?: TOptions) => {
        if (hasCachedDefault) {
            return cachedDefault;
        }

        const value = produceDefault(options);
        const normalized = normalizeResult(value);
        cachedDefault = normalized;
        hasCachedDefault = true;
        return normalized;
    };

    const resolve = (options?: TOptions) => {
        if (customResolver) {
            return normalizeResult(customResolver(options));
        }
        return resolveDefault(options);
    };

    const set = (resolver: Resolver<TResult, TOptions>) => {
        customResolver = assertFunction(resolver, "resolver") as Resolver<
            TResult,
            TOptions
        >;
    };

    const restore = () => {
        customResolver = null;
        return resolve();
    };

    return {
        resolve,
        restore,
        set
    };
}
