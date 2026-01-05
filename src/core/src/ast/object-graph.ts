import { isObjectLike } from "../utils/object.js";

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
