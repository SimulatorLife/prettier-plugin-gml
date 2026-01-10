/**
 * Utilities to traverse AST fragments needed by Feather diagnostic fixers.
 *
 * NOTE: AST traversal is now handled by Core.walkAst from @gml-modules/core,
 * which provides a unified, iterative walker that avoids deep recursion. This
 * module retains only the Feather-specific helper functions for extracting
 * context from AST nodes during traversal.
 */
import { Core } from "@gml-modules/core";

export function hasArrayParentWithNumericIndex(parent: unknown, property: unknown) {
    return Array.isArray(parent) && typeof property === "number";
}

/** Return context surrounding a call expression held inside an array so fixers can mutate siblings safely. */
export function resolveCallExpressionArrayContext(node: unknown, parent: unknown, property: unknown) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!Core.isNode(node) || node.type !== "CallExpression") {
        return null;
    }

    return {
        callExpression: node,
        siblings: parent,
        index: property
    };
}

export function getStartFromNode(node: unknown) {
    if (!Core.isNode(node)) return null;
    if (!Object.hasOwn(node, "start")) return null;
    return Core.cloneLocation((node as any).start);
}

/** Clone and return the `end` location associated with a node. */
export function getEndFromNode(node: unknown) {
    if (!Core.isNode(node)) return null;
    if (!Object.hasOwn(node, "end")) return null;
    return Core.cloneLocation((node as any).end);
}
