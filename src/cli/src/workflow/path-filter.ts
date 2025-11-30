import path from "node:path";

import {
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isPathInside,
    toArray,
    uniqueArray,
    compactArray
} from "../shared/dependencies.js";

export interface WorkflowPathFilterOptions {
    allowPaths?: Iterable<unknown>;
    denyPaths?: Iterable<unknown>;
    allowsPath?: (candidate: string) => boolean;
    allowsDirectory?: (candidate: string) => boolean;
}

export interface WorkflowPathFilter {
    allowList: Array<string>;
    denyList: Array<string>;
    allowsPath: (candidate: string) => boolean;
    allowsDirectory: (candidate: string) => boolean;
}

/**
 * Normalize workflow path lists into absolute, deduplicated entries.
 *
 * @param {Iterable<unknown> | null | undefined} paths
 * @returns {Array<string>}
 */
export function normalizeWorkflowPathList(
    paths: Iterable<unknown> | null | undefined
): Array<string> {
    const trimmed = compactArray(
        toArray(paths).map(getNonEmptyTrimmedString)
    ).filter((value): value is string => typeof value === "string");
    const resolved = trimmed.map((candidate) => path.resolve(candidate));
    return [...(uniqueArray(resolved, { freeze: false }) as Array<string>)];
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
export function createWorkflowPathFilter(
    filters: WorkflowPathFilterOptions | null | undefined = {}
): WorkflowPathFilter {
    if (
        filters &&
        typeof filters === "object" &&
        typeof filters.allowsDirectory === "function" &&
        typeof filters.allowsPath === "function"
    ) {
        return {
            allowList: normalizeWorkflowPathList(filters.allowPaths),
            denyList: normalizeWorkflowPathList(filters.denyPaths),
            allowsPath: filters.allowsPath,
            allowsDirectory: filters.allowsDirectory
        };
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

        return allowList.some(
            (allow) =>
                isPathInside(normalized, allow) ||
                (treatAsDirectory && isPathInside(allow, normalized))
        );
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

/**
 * Ensure the canonical manual cache and output paths are permitted by the
 * provided workflow filter. Callers can omit either path to reuse the shared
 * label/validation logic while guarding only the entries they care about.
 *
 * @param {ReturnType<typeof createWorkflowPathFilter> | undefined | null} pathFilter
 * @param {{
 *   cacheRoot?: string | null,
 *   outputPath?: string | null,
 *   cacheLabel?: string,
 *   outputLabel?: string
 * }} [options]
 * @returns {void}
 */
export function ensureManualWorkflowArtifactsAllowed(
    pathFilter: WorkflowPathFilter | null | undefined,
    {
        cacheRoot,
        outputPath,
        cacheLabel = "Manual cache root",
        outputLabel = "Manual output path"
    }: {
        cacheRoot?: string | null;
        outputPath?: string | null;
        cacheLabel?: string;
        outputLabel?: string;
    } = {}
) {
    const entries = [];

    if (isNonEmptyString(cacheRoot)) {
        entries.push({
            type: "directory",
            target: cacheRoot,
            label: cacheLabel
        });
    }

    if (isNonEmptyString(outputPath)) {
        entries.push({
            type: "path",
            target: outputPath,
            label: outputLabel
        });
    }

    if (entries.length === 0) {
        return;
    }

    ensureWorkflowPathsAllowed(pathFilter, entries);
}
