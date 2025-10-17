const registeredIgnorePaths = new Set();

function isValidPath(path) {
    return typeof path === "string" && path.length > 0;
}

export function hasRegisteredIgnorePath(ignorePath) {
    if (!isValidPath(ignorePath)) {
        return false;
    }
    return registeredIgnorePaths.has(ignorePath);
}

export function registerIgnorePath(ignorePath) {
    if (!isValidPath(ignorePath)) {
        return;
    }
    registeredIgnorePaths.add(ignorePath);
}

export function resetRegisteredIgnorePaths() {
    registeredIgnorePaths.clear();
}

export function getRegisteredIgnorePathCount() {
    return registeredIgnorePaths.size;
}

export function getRegisteredIgnorePathsSnapshot() {
    return [...registeredIgnorePaths];
}
