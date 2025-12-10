/**
 * Utilities to traverse AST fragments needed by Feather diagnostic fixers.
 */
import { Core } from "@gml-modules/core";

/**
 * Simple walker that invokes a visitor for every node and respects a visitor opt-out signal.
 */
export function walkAstNodes(
    root: unknown,
    visitor: (
        node: any,
        parent: unknown,
        key: string | number | null
    ) => void | boolean
) {
    const visit = (
        node: unknown,
        parent: unknown,
        key: string | number | null
    ): void => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }

            return;
        }

        if (!Core.isNode(node)) {
            return;
        }

        const shouldDescend = visitor(node, parent, key);

        if (shouldDescend === false) {
            return;
        }

        for (const [childKey, childValue] of Object.entries(node)) {
            if (childValue && typeof childValue === "object") {
                visit(childValue, node, childKey);
            }
        }
    };

    visit(root, null, null);
}

export function hasArrayParentWithNumericIndex(
    parent: unknown,
    property: unknown
) {
    if (!Array.isArray(parent)) {
        return false;
    }

    if (typeof property !== "number") {
        return false;
    }

    return true;
}

/** Return context surrounding a call expression held inside an array so fixers can mutate siblings safely. */
export function resolveCallExpressionArrayContext(
    node: unknown,
    parent: unknown,
    property: unknown
) {
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
