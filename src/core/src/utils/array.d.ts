/**
 * Normalize an iterable (or nullable) input into a concrete array so callers
 * can eagerly snapshot values before mutating the source. Unlike
 * {@link toArray}, which preserves array identity when possible, this helper
 * always returns a new array for iterables to avoid consuming generators more
 * than once.
 *
 * @template T
 * @param {Iterable<T> | Array<T> | null | undefined} values Candidate collection
 *        to normalize.
 * @returns {Array<T>} Array containing the iterable's elements, or an empty
 *          array when the input is nullish or non-iterable.
 */
export declare function toArrayFromIterable(values: any): any[];
/**
 * Coerce a nullable or singular value into an array so downstream code can
 * iterate without sprinkling `== null` checks.
 *
 * @template T
 * @param {T | Array<T> | null | undefined} value
 * @returns {Array<T>} Normalized array representation of the provided value.
 */
export declare function toArray(value: any): any[];
/**
 * Assert that the provided value is an array. Centralizes the guard so callers
 * can reuse the same error messaging while keeping their control flow focused
 * on the surrounding logic. Optionally tolerates `null`/`undefined` inputs by
 * returning an empty array when {@link allowNull} is enabled.
 *
 * @template T
 * @param {Array<T> | null | undefined | unknown} value Candidate value to validate.
 * @param {{
 *   name?: string,
 *   allowNull?: boolean,
 *   errorMessage?: string
 * }} [options]
 * @returns {Array<T>} The validated array or a fresh empty array when
 *                     `allowNull` permits nullable inputs.
 */
export declare function assertArray(
    value: any,
    {
        name,
        allowNull,
        errorMessage
    }?: {
        name?: string;
        allowNull?: boolean;
    }
): any[];
/**
 * Return the provided value when it is already an array, otherwise yield an
 * empty array. Useful for treating optional array-like properties as a safe
 * iterable without introducing conditional branches at each call site.
 *
 * @template T
 * @param {unknown} value
 * @returns {Array<T>} Either the original array or a shared empty array.
 */
export declare function asArray(value: any): readonly any[];
/**
 * Normalize a candidate array so callers can safely mutate the result without
 * repeating null checks and array guards. When the provided value is already
 * an array, the original reference is returned to preserve identity. All other
 * values fall back to a fresh empty array so mutations stay local to the call
 * site. Callers can opt into shallow cloning when they need to decouple from
 * the original array instance.
 *
 * @template T
 * @param {Array<T> | null | undefined | unknown} value
 * @param {{ clone?: boolean }} [options]
 * @param {boolean} [options.clone=false]
 * @returns {Array<T>} Mutably safe array representation of {@link value}.
 */
export declare function toMutableArray(
    value: any,
    {
        clone
    }?: {
        clone?: boolean;
    }
): any[];
/**
 * Determine whether the provided value is an array containing at least one
 * element. This check mirrors the defensive guard pattern used throughout the
 * printers and parsers when iterating over optional collections.
 *
 * @param {unknown} value
 * @returns {value is Array<unknown>} `true` when `value` is a populated array.
 */
export declare function isNonEmptyArray(value: any): boolean;
/**
 * Checks whether {@link index} can be safely used to read from {@link container}
 * without tripping over non-array parents or non-numeric indices. Centralizes
 * the guard so array-manipulating helpers can exit early before attempting to
 * splice or access unknown structures.
 *
 * @param {unknown} container Potential array owner of {@link index}.
 * @param {unknown} index Candidate index pointing into {@link container}.
 * @returns {index is number} `true` when {@link container} is an array and the
 *                            index is a numeric offset.
 */
export declare function isArrayIndex(container: any, index: any): boolean;
/**
 * Create a new array containing the first occurrence of each unique value
 * encountered in the provided iterable while preserving the original order.
 *
 * @template T
 * @param {Iterable<T> | Array<T> | null | undefined} values
 * @param {{ freeze?: boolean }} [options]
 * @param {boolean} [options.freeze=false]
 * @returns {Array<T> | ReadonlyArray<T>}
 */
export declare function uniqueArray(
    values: any,
    {
        freeze
    }?: {
        freeze?: boolean;
    }
): readonly unknown[];
/**
 * Remove falsy entries from {@link values} while preserving order. Mirrors the
 * common `array.filter(Boolean)` pattern used across the CLI but centralizes it
 * so future call sites do not need to reimplement the guard. Non-iterable
 * inputs fall back to an empty array to keep the helper resilient to optional
 * candidates.
 *
 * @template T
 * @param {Iterable<T> | Array<T> | null | undefined} values
 * @param {{ freeze?: boolean }} [options]
 * @param {boolean} [options.freeze=false]
 * @returns {Array<T> | ReadonlyArray<T>}
 */
export declare function compactArray(
    values: any,
    {
        freeze
    }?: {
        freeze?: boolean;
    }
): readonly any[];
/**
 * Append {@link value} to {@link array} when it is not already present.
 *
 * Centralizes the inclusion guard used throughout the project index and
 * resource analysis modules so callers can focus on their domain logic while
 * keeping duplicate prevention consistent. The helper now delegates to
 * `Array#includes`, preserving SameValueZero semantics (including `NaN`
 * handling) without reimplementing the iteration logic, and returns a boolean
 * so hot paths can detect when a new entry was appended.
 *
 * @template T
 * @param {Array<T>} array Array that should receive {@link value} when absent.
 * @param {T} value Candidate value to append.
 * @param {{ isEqual?: (existing: T, candidate: T) => boolean }} [options]
 *        Optional equality comparator for cases where strict equality is not
 *        sufficient.
 * @returns {boolean} `true` when the value was appended.
 */
export declare function pushUnique(
    array: any,
    value: any,
    { isEqual }?: {}
): boolean;
/**
 * Merge a collection of additional entries into a default array while
 * preserving order and eliminating duplicates. Callers can optionally supply a
 * coercion function to normalize raw entries before they are compared and a
 * key extractor to control how uniqueness is determined.
 *
 * @template T
 * @param {ReadonlyArray<T>} defaultValues
 * @param {Iterable<unknown> | null | undefined} additionalValues
 * @param {{
 *   coerce?: (value: unknown) => T | null | undefined,
 *   getKey?: (value: T) => unknown,
 *   freeze?: boolean
 * }} [options]
 * @param {(value: unknown) => T | null | undefined} [options.coerce]
 * @param {(value: T) => unknown} [options.getKey]
 * @param {boolean} [options.freeze]
 * @returns {ReadonlyArray<T>}
 */
export declare function mergeUniqueValues(
    defaultValues: any,
    additionalValues: any,
    {
        coerce,
        getKey,
        freeze
    }?: {
        getKey?: (value: any) => any;
        freeze?: boolean;
    }
): readonly any[];
/**
 * Normalize the accumulator used by CLI option collectors so commands can
 * accept either a scalar flag (for example `--tag alpha`) or repeated
 * invocations (`--tag alpha --tag beta`). The helper mirrors Commander's
 * accumulation semantics and is reused by multiple modules that surface
 * collection-style options.
 *
 * @template T
 * @param {T} value Value to append to the collection.
 * @param {Array<T> | T | undefined} collection Current accumulator provided by
 *        Commander (or similar collectors).
 * @returns {Array<T>} Array containing both prior entries and {@link value}.
 */
export declare function appendToCollection(value: any, collection: any): any[];
