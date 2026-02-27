import { Core } from "@gml-modules/core";
const { isFunctionLikeNode } = Core;

/**
 * Determines whether a node should be treated as function-like for synthetic
 * doc-comment generation.
 */
export function isFunctionLikeDocCommentNode(node: unknown) {
    return isFunctionLikeNode(node);
}
