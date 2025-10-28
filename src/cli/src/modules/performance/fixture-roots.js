import path from "node:path";

import { isPathInside, toArray, uniqueArray } from "../dependencies.js";
import { REPO_ROOT } from "../../shared/workspace-paths.js";

export const DEFAULT_FIXTURE_DIRECTORIES = Object.freeze([
    path.resolve(REPO_ROOT, "src", "parser", "test", "input"),
    path.resolve(REPO_ROOT, "src", "plugin", "test")
]);

function normalizeWorkflowPathList(paths) {
    const candidates = [];

    for (const entry of toArray(paths)) {
        if (typeof entry !== "string") {
            continue;
        }

        const trimmed = entry.trim();
        if (trimmed.length === 0) {
            continue;
        }

        candidates.push(path.resolve(trimmed));
    }

    return uniqueArray(candidates);
}

export function createPathFilter(filters = {}) {
    if (
        filters &&
        typeof filters.allowsDirectory === "function" &&
        typeof filters.allowsPath === "function"
    ) {
        return filters;
    }

    const allowList = normalizeWorkflowPathList(filters.allowPaths);
    const denyList = normalizeWorkflowPathList(filters.denyPaths);
    const hasAllow = allowList.length > 0;

    const allowsPath = (candidate) => {
        if (typeof candidate !== "string") {
            return false;
        }

        const normalized = path.resolve(candidate);

        if (denyList.some((deny) => isPathInside(normalized, deny))) {
            return false;
        }

        if (!hasAllow) {
            return true;
        }

        return allowList.some((allow) => isPathInside(normalized, allow));
    };

    const allowsDirectory = (candidate) => {
        if (typeof candidate !== "string") {
            return false;
        }

        const normalized = path.resolve(candidate);

        if (denyList.some((deny) => isPathInside(normalized, deny))) {
            return false;
        }

        if (!hasAllow) {
            return true;
        }

        return allowList.some(
            (allow) =>
                isPathInside(normalized, allow) ||
                isPathInside(allow, normalized)
        );
    };

    return {
        allowList,
        denyList,
        hasAllow,
        allowsPath,
        allowsDirectory
    };
}

export function normalizeFixtureRoots(
    additionalRoots = [],
    filterOptions = {}
) {
    const pathFilter = createPathFilter(filterOptions);
    const candidates = [
        ...DEFAULT_FIXTURE_DIRECTORIES,
        ...(Array.isArray(additionalRoots)
            ? additionalRoots
            : toArray(additionalRoots))
    ];

    const resolved = [];
    const seen = new Set();

    for (const candidate of candidates) {
        if (typeof candidate !== "string" || candidate.length === 0) {
            continue;
        }

        const normalized = path.resolve(candidate);
        if (seen.has(normalized)) {
            continue;
        }

        if (!pathFilter.allowsDirectory(normalized)) {
            continue;
        }

        seen.add(normalized);
        resolved.push(normalized);
    }

    return resolved;
}
export { REPO_ROOT } from "../../shared/workspace-paths.js";
