import { Core } from "@gml-modules/core";

const { isFunctionLikeNode } = Core;
// TODO: Remove this passthrough function and file and just call Core.isFunctionLikeNode directly
/**
 * Determines whether a node should be treated as function-like for synthetic
 * doc-comment generation.
 */
export function isFunctionLikeDocCommentNode(node: unknown) {
    return isFunctionLikeNode(node);
}
