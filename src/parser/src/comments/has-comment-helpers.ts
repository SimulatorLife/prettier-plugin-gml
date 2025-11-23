import { Core } from "@gml-modules/core";

export function getHasCommentHelper(helpers: any) {
    if (Core.isObjectLike(helpers) && typeof helpers.hasComment === "function") {
        return helpers.hasComment;
    }
    return Core.hasComment;
}

export function normalizeHasCommentHelpers(helpers: any) {
    const normalizedHasComment = getHasCommentHelper(helpers);
    return { hasComment: normalizedHasComment };
}
