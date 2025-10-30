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
    return uniqueArray(
        toArray(paths)
            .map(getNonEmptyTrimmedString)
            .filter(Boolean)
            .map((candidate) => path.resolve(candidate))
    );
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
    const allows = (candidate, { treatAsDirectory = false } = {}) => {
        if (typeof candidate !== "string") {
            return false;
        }

        const normalized = path.resolve(candidate);

        if (denyList.some((deny) => isPathInside(normalized, deny))) {
            return false;
        }

        if (allowList.length === 0) {
            return true;
        }

        return allowList.some((allow) => {
            if (isPathInside(normalized, allow)) {
                return true;
            }

            return treatAsDirectory && isPathInside(allow, normalized);
        });
    };

    const allowsPath = (candidate) => allows(candidate);
    const allowsDirectory = (candidate) =>
        allows(candidate, { treatAsDirectory: true });

    return {
        allowList,
        denyList,
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
