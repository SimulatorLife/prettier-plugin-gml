import { hasOwn, isObjectLike, withObjectLike } from "../utils/object.js";

// Shared helpers for working with AST node location metadata.
// These utilities centralize the logic for reading start/end positions
// so both the parser and printer can remain consistent without duplicating
// defensive checks around optional location shapes.

function getLocationIndex(node, key) {
    return withObjectLike(
        node,
        (nodeObject) => {
            const location = nodeObject[key];

            if (typeof location === "number") {
                return location;
            }

            return withObjectLike(
                location,
                (locationObject) => {
                    const { index } = locationObject;
                    return typeof index === "number" ? index : null;
                },
                () => null
            );
        },
        () => null
    );
}

function getStartIndex(node) {
    if (!isObjectLike(node)) {
        return null;
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

function cloneLocation(location) {
    if (isObjectLike(location)) {
        return structuredClone(location);
    }

    if (location == null) {
        return location ?? undefined;
    }

    return location;
}

function assignClonedLocation(target, template) {
    return withObjectLike(
        target,
        (mutableTarget) =>
            withObjectLike(
                template,
                (templateNode) => {
                    let shouldAssign = false;
                    const clonedLocations = {};

                    if (hasOwn(templateNode, "start")) {
                        clonedLocations.start = cloneLocation(
                            templateNode.start
                        );
                        shouldAssign = true;
                    }

                    if (hasOwn(templateNode, "end")) {
                        clonedLocations.end = cloneLocation(templateNode.end);
                        shouldAssign = true;
                    }

                    if (shouldAssign) {
                        Object.assign(mutableTarget, clonedLocations);
                    }

                    return mutableTarget;
                },
                () => mutableTarget
            ),
        () => target
    );
}

function getNodeRangeIndices(node) {
    const start = getNodeStartIndex(node);
    const endLocation = getLocationIndex(node, "end");

    let end = null;
    if (typeof endLocation === "number") {
        end = endLocation + 1;
    } else if (typeof start === "number") {
        end = start;
    }

    return {
        start,
        end
    };
}

function getNodeLocationLine(node, key) {
    return withObjectLike(
        node,
        (nodeObject) =>
            withObjectLike(
                nodeObject[key],
                (location) => {
                    const { line } = location;
                    return typeof line === "number" ? line : null;
                },
                () => null
            ),
        () => null
    );
}

function getNodeStartLine(node) {
    return getNodeLocationLine(node, "start");
}

function getNodeEndLine(node) {
    return (
        getNodeLocationLine(node, "end") ?? getNodeLocationLine(node, "start")
    );
}

export {
    getNodeStartIndex,
    getNodeEndIndex,
    getNodeRangeIndices,
    getNodeStartLine,
    getNodeEndLine,
    cloneLocation,
    assignClonedLocation
};
