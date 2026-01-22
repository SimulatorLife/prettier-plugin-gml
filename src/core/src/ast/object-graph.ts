import { isObjectLike } from "../utils/object.js";
import { IGNORED_NODE_CHILD_KEYS, isNode } from "./node-helpers.js";

type ObjectRecord = Record<string, unknown>;

export type WalkObjectGraphOptions = {
    enterObject?: (
        value: ObjectRecord,
        parent: ObjectRecord | Array<unknown> | null,
        key: string | number | null
    ) => boolean | void;
    enterArray?: (
        value: Array<unknown>,
        parent: ObjectRecord | Array<unknown> | null,
        key: string | number | null
    ) => boolean | void;
};

type WalkFrame = {
    value: object | Array<unknown>;
    parent: ObjectRecord | Array<unknown> | null;
    key: string | number | null;
};

export function walkObjectGraph(root: unknown, options: WalkObjectGraphOptions = {}) {
    if (!isObjectLike(root) && !Array.isArray(root)) {
        return;
    }

    const { enterObject, enterArray } = options;
    const stack: WalkFrame[] = [
        {
            value: root as object | Array<unknown>,
            parent: null,
            key: null
        }
    ];
    const seen = new WeakSet<object | Array<unknown>>();

    while (stack.length > 0) {
        const frame = stack.pop();
        const { value, parent, key } = frame;

        if (!value || typeof value !== "object") {
            continue;
        }

        if (seen.has(value)) {
            continue;
        }

        seen.add(value);

        if (Array.isArray(value)) {
            if (typeof enterArray === "function") {
                const shouldTraverse = enterArray(value, parent, key);
                if (shouldTraverse === false) {
                    continue;
                }
            }

            for (let index = value.length - 1; index >= 0; index -= 1) {
                const item = value[index];
                if (!item || typeof item !== "object") {
                    continue;
                }

                stack.push({
                    value: item as object | Array<unknown>,
                    parent: value,
                    key: index
                });
            }

            continue;
        }

        const objectValue = value as ObjectRecord;

        if (typeof enterObject === "function") {
            const shouldTraverse = enterObject(objectValue, parent, key);
            if (shouldTraverse === false) {
                continue;
            }
        }

        const keys = Object.keys(objectValue);
        // Object.keys() only returns own enumerable string-keyed properties, so
        // the Object.hasOwn check is redundant. Removing it reduces iterations
        // in this hot path by eliminating an unnecessary property lookup.
        for (let index = keys.length - 1; index >= 0; index -= 1) {
            const childKey = keys[index];

            if (IGNORED_NODE_CHILD_KEYS.has(childKey)) {
                continue;
            }

            const childValue = objectValue[childKey];
            if (!childValue || typeof childValue !== "object") {
                continue;
            }

            stack.push({
                value: childValue as object | Array<unknown>,
                parent: objectValue,
                key: childKey
            });
        }
    }
}

/**
 * Simplified AST walker that visits each AST node with a single callback.
 *
 * This helper wraps `walkObjectGraph` to provide a simpler interface for AST
 * traversal where the visitor function receives each node along with its parent
 * and key context. The visitor can return `false` to prevent descending into
 * child nodes.
 *
 * Unlike `walkObjectGraph`, which separates object and array handling, this
 * function filters to AST nodes (via `isNode`) and provides a unified callback
 * signature that matches the common pattern used throughout the plugin layer.
 *
 * @param root The root node or value to start traversal from.
 * @param visitor Callback invoked for each AST node. Receives the node, its
 *                parent (object or array), and the key (string or number) by
 *                which it's referenced. Return `false` to skip descending into
 *                this node's children.
 */
export function walkAst(
    root: unknown,
    visitor: (node: any, parent: unknown, key: string | number | null) => void | boolean
): void {
    walkObjectGraph(root, {
        enterObject(value, parent, key) {
            if (!isNode(value)) {
                return;
            }

            return visitor(value, parent, key);
        },
        enterArray() {
            // Arrays themselves are not AST nodes, but we need to traverse
            // them to reach the nodes they contain. Always descend into arrays.
        }
    });
}
