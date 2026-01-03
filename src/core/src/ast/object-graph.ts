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
                const arrayValue = value as Array<unknown>;
                const shouldTraverse = enterArray(arrayValue, parent, key);
                if (shouldTraverse === false) {
                    continue;
                }
            }

            for (let index = value.length - 1; index >= 0; index -= 1) {
                const item = value[index];
                if (!item || typeof item !== "object") {
                    continue;
                }

                const nextValue = item as object | Array<unknown>;
                stack.push({
                    value: nextValue,
                    parent: value as ObjectRecord | Array<unknown>,
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
        for (let index = keys.length - 1; index >= 0; index -= 1) {
            const childKey = keys[index];
            if (!Object.hasOwn(objectValue, childKey)) {
                continue;
            }

            const childValue = objectValue[childKey];
            if (!childValue || typeof childValue !== "object") {
                continue;
            }

            const nextValue = childValue as object | Array<unknown>;
            stack.push({
                value: nextValue,
                parent: value as ObjectRecord | Array<unknown>,
                key: childKey
            });
        }
    }
}
