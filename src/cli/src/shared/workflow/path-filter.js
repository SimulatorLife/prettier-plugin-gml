import path from "node:path";

import {
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isPathInside,
    toArray,
    uniqueArray
} from "../../shared/dependencies.js";

/**
 * Normalize workflow path lists into absolute, deduplicated entries.
 *
 * @param {Iterable<unknown> | unknown} paths
 * @returns {Array<string>}
 */
export function normalizeWorkflowPathList(paths) {
    const candidates = [];

    for (const entry of toArray(paths)) {
        const normalized = getNonEmptyTrimmedString(entry);
        if (!normalized) {
            continue;
        }

        candidates.push(path.resolve(normalized));
    }

    return uniqueArray(candidates);
}

/**
 * Create a workflow path filter from allow/deny lists. Existing filters are
 * returned as-is so callers can forward custom implementations unchanged.
 *
 * @param {{
 *   allowPaths?: Iterable<unknown>,
 *   denyPaths?: Iterable<unknown>,
 *   allowsPath?: (candidate: string) => boolean,
 *   allowsDirectory?: (candidate: string) => boolean
 * } | null | undefined} filters
 * @returns {{
 *   allowList: Array<string>,
 *   denyList: Array<string>,
 *   hasAllow: boolean,
 *   allowsPath: (candidate: string) => boolean,
 *   allowsDirectory: (candidate: string) => boolean
 * }}
 */
export function createWorkflowPathFilter(filters = {}) {
    if (
        filters &&
        typeof filters === "object" &&
        typeof filters.allowsDirectory === "function" &&
        typeof filters.allowsPath === "function"
    ) {
        return filters;
    }

    const allowList = normalizeWorkflowPathList(filters?.allowPaths);
    const denyList = normalizeWorkflowPathList(filters?.denyPaths);
    const hasAllow = allowList.length > 0;

    const normalizeCandidate = (candidate) =>
        typeof candidate === "string" ? path.resolve(candidate) : null;

    const isAllowed = (candidate, matcher) => {
        const normalized = normalizeCandidate(candidate);
        if (!normalized) {
            return false;
        }

        if (denyList.some((deny) => isPathInside(normalized, deny))) {
            return false;
        }

        return (
            !hasAllow || allowList.some((allow) => matcher(allow, normalized))
        );
    };

    const allowsPath = (candidate) =>
        isAllowed(candidate, (allow, normalized) =>
            isPathInside(normalized, allow)
        );

    const allowsDirectory = (candidate) =>
        isAllowed(
            candidate,
            (allow, normalized) =>
                isPathInside(normalized, allow) ||
                isPathInside(allow, normalized)
        );

    return {
        allowList,
        denyList,
        hasAllow,
        allowsPath,
        allowsDirectory
    };
}

/**
 * Ensure the provided directories and paths are permitted by the given
 * workflow path filter. Entries without a recognized type or missing target
 * values are ignored so callers can dynamically build the list without
 * pre-validating every field.
 *
 * @param {ReturnType<typeof createWorkflowPathFilter> | undefined | null} pathFilter
 * @param {Array<{
 *   target?: string,
 *   label?: string,
 *   type?: "directory" | "path"
 * }>} [entries]
 * @returns {void}
 */
export function ensureWorkflowPathsAllowed(pathFilter, entries = []) {
    if (!pathFilter || typeof pathFilter !== "object") {
        return;
    }

    const { allowsPath, allowsDirectory } = pathFilter;

    for (const entry of entries) {
        if (!entry || typeof entry !== "object") {
            continue;
        }

        const { target, label } = entry;
        const type = entry.type === "directory" ? "directory" : "path";

        if (!isNonEmptyString(target)) {
            continue;
        }

        const description =
            label ?? (type === "directory" ? "Directory" : "Path");

        if (
            type === "directory" &&
            typeof allowsDirectory === "function" &&
            !allowsDirectory(target)
        ) {
            throw new Error(
                `${description} '${target}' is not permitted by workflow path filters.`
            );
        }

        if (
            type === "path" &&
            typeof allowsPath === "function" &&
            !allowsPath(target)
        ) {
            throw new Error(
                `${description} '${target}' is not permitted by workflow path filters.`
            );
        }
    }
}
