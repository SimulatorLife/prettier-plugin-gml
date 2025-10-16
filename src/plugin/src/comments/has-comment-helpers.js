import {
    hasComment as sharedHasComment,
    isObjectLike
} from "./comment-boundary.js";

/**
 * Resolve the active `hasComment` helper from the provided helper bag.
 *
 * @param {unknown} helpers
 * @returns {(node: unknown) => boolean}
 */
export function getHasCommentHelper(helpers) {
    if (typeof helpers === "function") {
        return helpers;
    }

    if (isObjectLike(helpers) && typeof helpers.hasComment === "function") {
        return helpers.hasComment;
    }

    return sharedHasComment;
}

/**
 * Ensure the supplied helper bag exposes a usable `hasComment` function while
 * preserving any additional helper overrides.
 *
 * @template THelpers extends object
 * @param {THelpers | null | undefined} helpers
 * @returns {THelpers & { hasComment: (node: unknown) => boolean }}
 */
export function normalizeHasCommentHelpers(helpers) {
    const normalizedHasComment = getHasCommentHelper(helpers);

    return {
        ...(isObjectLike(helpers)
            ? helpers
            : /** @type {Partial<THelpers>} */ ({})),
        hasComment: normalizedHasComment
    };
}
