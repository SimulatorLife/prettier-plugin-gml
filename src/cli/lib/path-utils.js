import {
    collectUniqueAncestorDirectories,
    isPathInside as sharedIsPathInside
} from "../../shared/path-utils.js";

export function collectAncestorDirectories(...startingDirectories) {
    return collectUniqueAncestorDirectories(startingDirectories);
}

export function isPathInside(childPath, parentPath) {
    return sharedIsPathInside(childPath, parentPath);
}
