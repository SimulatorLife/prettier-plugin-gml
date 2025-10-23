import path from "node:path";

import { toPosixPath } from "../../../shared/path-utils.js";
import {
    getNonEmptyString,
    isNonEmptyString
} from "../../../shared/string-utils.js";
import { resolveProjectPathInfo } from "./path-info.js";

export function normalizeProjectResourcePath(rawPath, { projectRoot } = {}) {
    if (!isNonEmptyString(rawPath)) {
        return null;
    }

    const normalized = toPosixPath(rawPath).replace(/^\.\//, "");
    if (!projectRoot) {
        return normalized;
    }

    const absoluteCandidate = path.isAbsolute(normalized)
        ? normalized
        : path.join(projectRoot, normalized);
    const info = resolveProjectPathInfo(absoluteCandidate, projectRoot);
    if (!info) {
        return null;
    }

    return toPosixPath(info.relativePath);
}

export function resolveProjectRelativeFilePath(projectRoot, absoluteFilePath) {
    const info = resolveProjectPathInfo(absoluteFilePath, projectRoot);
    if (!info) {
        return null;
    }

    if (!info.hasProjectRoot) {
        return toPosixPath(info.absolutePath);
    }

    return toPosixPath(info.relativePath);
}

export function resolveProjectDisplayPath(filePath, projectRoot) {
    const normalizedFilePath = getNonEmptyString(filePath);
    if (!normalizedFilePath) {
        return null;
    }

    const info = resolveProjectPathInfo(normalizedFilePath, projectRoot);
    if (!info) {
        return null;
    }

    if (!info.inputWasAbsolute) {
        return normalizedFilePath;
    }

    if (info.hasProjectRoot && info.isInsideProjectRoot) {
        const relative = info.relativePath;
        if (relative) {
            return relative;
        }
    }

    return normalizedFilePath;
}
