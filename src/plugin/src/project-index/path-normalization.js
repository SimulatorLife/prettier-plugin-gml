import path from "node:path";

import {
    toPosixPath,
    assertFunction,
    getNonEmptyString,
    isNonEmptyString
} from "../shared/index.js";
import { resolveProjectPathInfo } from "./path-info.js";

function withProjectPathInfo(filePath, projectRoot, projector) {
    assertFunction(projector, "projector");

    const info = resolveProjectPathInfo(filePath, projectRoot);
    if (!info) {
        return null;
    }

    return projector(info);
}

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

    return withProjectPathInfo(absoluteCandidate, projectRoot, (info) =>
        toPosixPath(info.relativePath)
    );
}

export function resolveProjectRelativeFilePath(projectRoot, absoluteFilePath) {
    return withProjectPathInfo(absoluteFilePath, projectRoot, (info) =>
        toPosixPath(info.hasProjectRoot ? info.relativePath : info.absolutePath)
    );
}

export function resolveProjectDisplayPath(filePath, projectRoot) {
    const normalizedFilePath = getNonEmptyString(filePath);
    if (!normalizedFilePath) {
        return null;
    }

    return withProjectPathInfo(normalizedFilePath, projectRoot, (info) => {
        if (
            !info.inputWasAbsolute ||
            !info.hasProjectRoot ||
            !info.isInsideProjectRoot
        ) {
            return normalizedFilePath;
        }

        return info.relativePath || normalizedFilePath;
    });
}
