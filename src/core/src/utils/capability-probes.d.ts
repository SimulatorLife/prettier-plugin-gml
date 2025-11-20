/**
 * Determine whether {@link value} exposes a callable member named
 * {@link property}. Several capability probes rely on this check to detect
 * RegExp, Map, and Set lookalikes along with parser-specific error facades, so
 * centralizing the logic ensures each module makes consistent decisions.
 *
 * @param {unknown} value Candidate object to inspect.
 * @param {string | symbol} property Property name to look up on {@link value}.
 * @returns {boolean} `true` when the property exists and is callable.
 */
export declare function hasFunction(value: any, property: any): boolean;
/**
 * Determine whether a value resembles an `Error` object by checking for the
 * standard `message` property and optional `name` field. Accepts error-like
 * objects from any realm or custom Error subclasses so consumers can handle
 * cross-boundary error reporting without relying on `instanceof`.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is Error} `true` when the value matches the Error shape.
 */
export declare function isErrorLike(value: any): boolean;
/**
 * Determine whether a value resembles an `AggregateError` object by confirming
 * both the standard Error shape and an `errors` array property. Supports
 * cross-realm error handling so CLI modules can safely report batched failures
 * without depending on `instanceof AggregateError`.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is AggregateError} `true` when the value matches the AggregateError shape.
 */
export declare function isAggregateErrorLike(value: any): boolean;
/**
 * Determine whether a value behaves like a `RegExp` by checking for the
 * presence of `test` and `exec` methods. Accepts cross-realm RegExp instances
 * and polyfills so the formatter can uniformly validate pattern-like objects
 * without relying on `instanceof RegExp`.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is RegExp} `true` when the value exposes RegExp methods.
 */
export declare function isRegExpLike(value: any): boolean;
/**
 * Determine whether a value implements the `Map` interface by confirming it
 * exposes `get`, `set`, `has`, and an iterator method. Accepts cross-realm Map
 * instances and Map-like polyfills so the formatter can treat collection-like
 * structures uniformly regardless of their prototype chain.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is Map<unknown, unknown>} `true` when the value behaves like a Map.
 */
export declare function isMapLike(value: any): boolean;
/**
 * Determine whether a value implements the `Set` interface by confirming it
 * exposes `has`, `add`, and an iterator method. Accepts cross-realm Set
 * instances and Set-like polyfills so callers can normalize collection-like
 * structures without depending on `instanceof Set`.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is Set<unknown>} `true` when the value behaves like a Set.
 */
export declare function isSetLike(value: any): boolean;
/**
 * Lightweight truthiness probe for collection-like objects. Prefers numeric
 * `length`/`size` hints before walking an iterator so that expensive or
 * side-effectful iterables (generators) are only consumed when strictly
 * necessary. Non-iterable values immediately return `false` so callers can pass
 * optional inputs without pre-validating them.
 *
 * @param {Iterable<unknown> | { length?: number, size?: number } | null | undefined} iterable
 *        Candidate collection to inspect.
 * @returns {boolean} `true` when at least one item is detected, otherwise
 *                    `false`.
 */
export declare function hasIterableItems(iterable: any): boolean;
/**
 * Determine how many items an iterable-like object exposes. Numeric hints are
 * trusted when finite, mirroring the fast-path in {@link hasIterableItems};
 * otherwise the iterator is consumed eagerly to obtain an exact count.
 * Non-iterable values fall back to `0` so callers can safely chain arithmetic.
 *
 * @param {Iterable<unknown> | { length?: number, size?: number } | null | undefined} iterable
 *        Candidate collection to size.
 * @returns {number} Number of elements yielded by the iterable.
 */
export declare function getIterableSize(iterable: any): number;
/**
 * Coerce a value into a `Set`-like instance. Returns the input unmodified when
 * it already implements the Set interface; otherwise constructs a new `Set`
 * from arrays, iterables, or falls back to an empty Set for non-iterable
 * inputs. This helper avoids repeatedly checking type unions when normalizing
 * user options or collection literals.
 *
 * @param {unknown} candidate Value to normalize into a Set.
 * @returns {Set<unknown>} Set-like instance or newly constructed Set.
 */
export declare function ensureSet(candidate: any): any;
/**
 * Coerce a value into a `Map`-like instance. Returns the input unmodified when
 * it already implements the Map interface; constructs a new `Map` from entry
 * arrays, iterables, or plain objects via {@link resolveMapEntries}. Set-like
 * inputs yield an empty Map to avoid misinterpreting single values as entries.
 * This helper avoids branching on type unions when normalizing user options.
 *
 * @param {unknown} candidate Value to normalize into a Map.
 * @returns {Map<unknown, unknown>} Map-like instance or newly constructed Map.
 */
export declare function ensureMap(candidate: any): any;
