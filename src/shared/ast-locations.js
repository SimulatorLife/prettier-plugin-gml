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
    return getLocationIndex(node, "start");
}

function getEndIndex(node) {
    return getLocationIndex(node, "end");
}

function getNodeStartIndex(node) {
    const startIndex = getStartIndex(node);
    return typeof startIndex === "number" ? startIndex : null;
}

function getNodeEndIndex(node) {
    const endIndex = getEndIndex(node);
    if (typeof endIndex === "number") {
        return endIndex + 1;
    }

    const fallbackStart = getStartIndex(node);
    return typeof fallbackStart === "number" ? fallbackStart : null;
}

export {
    getLocationIndex,
    getStartIndex,
    getEndIndex,
    getNodeStartIndex,
    getNodeEndIndex
};
