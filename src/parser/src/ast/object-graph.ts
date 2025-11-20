import { Core } from "@gml-modules/core";

/**
 * Iteratively walk every object and array reachable from {@link root}, invoking
 * the provided callbacks for each entry. The traversal guards against cyclic
 * graphs so callers can share the helper across parser transforms without
 * re-implementing stack management on every call site.
 *
 * Returning `false` from either callback skips visiting the current value's
 * children. All other return values are ignored so visitors remain tersely
 * expressed.
 *
 * @param {unknown} root Value to traverse.
 * @param {{
 *   enterObject?: (value: object, parent: object | Array<unknown> | null, key: string | number | null) => boolean | void,
 *   enterArray?: (value: Array<unknown>, parent: object | Array<unknown> | null, key: string | number | null) => boolean | void,
 * }} [options]
 */
export function walkObjectGraph(root, options = {}) {
    if (!Core.isObjectLike(root) && !Array.isArray(root)) {
        return;
    }

    const { enterObject, enterArray } = options;
    const stack = [{ value: root, parent: null, key: null }];
    const seen = new WeakSet();

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

                stack.push({ value: item, parent: value, key: index });
            }

            continue;
        }

        if (typeof enterObject === "function") {
            const shouldTraverse = enterObject(value, parent, key);
            if (shouldTraverse === false) {
                continue;
            }
        }

        const keys = Object.keys(value);
        for (let index = keys.length - 1; index >= 0; index -= 1) {
            const childKey = keys[index];
            if (!Object.hasOwn(value, childKey)) {
                continue;
            }

            const childValue = value[childKey];

            if (!childValue || typeof childValue !== "object") {
                continue;
            }

            stack.push({ value: childValue, parent: value, key: childKey });
        }
    }
}
