import { hasOwn } from "./object-utils.js";

// Shared helpers for working with AST node location metadata.
// These utilities centralize the logic for reading start/end positions
// so both the parser and printer can remain consistent without duplicating
// defensive checks around optional location shapes.

function getLocationIndex(node, key) {
    if (!node) {
        return undefined;
    }

    const location = node[key];
    if (typeof location === "number") {
        return location;
    }

    if (location && typeof location.index === "number") {
        return location.index;
    }

    return undefined;
}

function getStartIndex(node) {
    if (!node) {
        return undefined;
    }

    const isMemberAccess =
        (node.type === "MemberDotExpression" ||
            node.type === "MemberIndexExpression") &&
        node.object;

    if (isMemberAccess) {
        const objectStart = getStartIndex(node.object);
        if (typeof objectStart === "number") {
            return objectStart;
        }
    }

    return getLocationIndex(node, "start");
}

function getNodeStartIndex(node) {
    const startIndex = getStartIndex(node);
    return typeof startIndex === "number" ? startIndex : null;
}

function getNodeEndIndex(node) {
    const endIndex = getLocationIndex(node, "end");
    if (typeof endIndex === "number") {
        return endIndex + 1;
    }

    const fallbackStart = getStartIndex(node);
    return typeof fallbackStart === "number" ? fallbackStart : null;
}

function isPlainObjectOrArray(value) {
    if (!value || typeof value !== "object") {
        return false;
    }

    if (Array.isArray(value)) {
        return true;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function clonePlainContainer(root) {
    const cloneRoot = Array.isArray(root) ? new Array(root.length) : {};
    const stack = [{ source: root, target: cloneRoot }];

    while (stack.length > 0) {
        const { source, target } = stack.pop();

        if (Array.isArray(source)) {
            for (let index = 0; index < source.length; index += 1) {
                const value = source[index];
                if (isPlainObjectOrArray(value)) {
                    const childClone = Array.isArray(value)
                        ? new Array(value.length)
                        : {};
                    target[index] = childClone;
                    stack.push({ source: value, target: childClone });
                } else {
                    target[index] = value;
                }
            }
            continue;
        }

        for (const key in source) {
            if (!hasOwn(source, key)) {
                continue;
            }

            const value = source[key];
            if (isPlainObjectOrArray(value)) {
                const childClone = Array.isArray(value)
                    ? new Array(value.length)
                    : {};
                target[key] = childClone;
                stack.push({ source: value, target: childClone });
            } else {
                target[key] = value;
            }
        }
    }

    return cloneRoot;
}

function cloneLocation(location) {
    if (location == null) {
        return undefined;
    }

    if (typeof location !== "object") {
        return location;
    }

    if (!isPlainObjectOrArray(location)) {
        return structuredClone(location);
    }

    return clonePlainContainer(location);
}

export { getNodeStartIndex, getNodeEndIndex, cloneLocation };
