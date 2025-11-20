/**
 * Iteratively walk every object and array reachable from {@link root}, invoking
 * the provided callbacks for each entry. The traversal guards against cyclic
 * graphs so callers can share the helper across parser transforms without
 * re-implementing stack management on every call site.
 *
 * Returning `false` from either callback skips visiting the current value's
 * children. All other return values are ignored so visitors remain tersely
 * expressed.
 *
 * @param {unknown} root Value to traverse.
 * @param {{
 *   enterObject?: (value: object, parent: object | Array<unknown> | null, key: string | number | null) => boolean | void,
 *   enterArray?: (value: Array<unknown>, parent: object | Array<unknown> | null, key: string | number | null) => boolean | void,
 * }} [options]
 */
export declare function walkObjectGraph(root: any, options?: {}): void;
