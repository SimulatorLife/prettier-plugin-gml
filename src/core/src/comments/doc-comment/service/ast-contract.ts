import { isFunctionLikeNode } from "../../../ast/index.js";

/**
 * Determines whether a node should be treated as function-like for synthetic
 * doc-comment generation.
 */
export function isFunctionLikeDocCommentNode(node: unknown) {
    return isFunctionLikeNode(node);
}
