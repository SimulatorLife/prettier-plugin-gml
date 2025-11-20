/**
 * @template TOptions
 * @template TResult
 * @typedef {object} ResolverController
 * @property {(options?: TOptions) => TResult} resolve
 * @property {(candidate: unknown) => TResult} set
 * @property {() => TResult} restore
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
 * @returns {ResolverController<TOptions, TResult>}
 */
export declare function createResolverController({ name, errorMessage, defaultFactory, invoke, normalize, reuseDefaultValue }: {
    name?: string;
    errorMessage: any;
    defaultFactory: any;
    invoke?: (resolver: any, options: any) => any;
    normalize?: (result: any) => any;
    reuseDefaultValue?: boolean;
}): Readonly<{
    resolve: (options?: {}) => any;
    set: (candidate: any) => any;
    restore: () => any;
}>;
