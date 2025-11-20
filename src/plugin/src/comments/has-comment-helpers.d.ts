/**
 * Resolve the active `hasComment` helper from the provided helper bag.
 *
 * @param {unknown} helpers
 * @returns {(node: unknown) => boolean}
 */
export declare function getHasCommentHelper(helpers: any): any;
/**
 * Ensure the supplied helper bag exposes a usable `hasComment` function while
 * preserving any additional helper overrides.
 *
 * @template THelpers extends object
 * @param {THelpers | null | undefined} helpers
 * @returns {THelpers & { hasComment: (node: unknown) => boolean }}
 */
export declare function normalizeHasCommentHelpers(helpers: any): any;
