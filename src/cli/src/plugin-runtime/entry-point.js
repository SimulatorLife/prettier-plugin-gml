import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
    compactArray,
    createListSplitPattern,
    getNonEmptyTrimmedString,
    normalizeStringList,
    toArray,
    uniqueArray
} from "../dependencies.js";
import { resolveFromRepoRoot } from "../shared/workspace-paths.js";

// Default plugin entry points shipped within the workspace. Additional
// candidates can be provided via environment variables or call-site overrides.
const DEFAULT_CANDIDATE_PLUGIN_PATHS = Object.freeze([
    ["src", "plugin", "src", "gml.js"],
    ["src", "plugin", "src", "index.js"],
    ["src", "plugin", "index.js"]
]);

const LIST_SPLIT_PATTERN = createListSplitPattern(
    compactArray([",", path.delimiter])
);

// Normalize caller-provided options so destructuring guards against
// `null`/primitive inputs instead of throwing TypeError when accessing
// properties on non-object values.
function normalizeOptionsBag(options) {
    return options && typeof options === "object" ? options : {};
}

function expandLeadingTilde(candidate) {
    if (typeof candidate !== "string" || candidate[0] !== "~") {
        return candidate;
    }

    const nextCharacter = candidate[1];
    const hasExplicitHomeReference =
        nextCharacter === undefined ||
        nextCharacter === "/" ||
        nextCharacter === "\\";

    if (!hasExplicitHomeReference) {
        return candidate;
    }

    const homeDirectory = os.homedir();
    if (!homeDirectory) {
        return candidate;
    }

    if (candidate.length === 1) {
        return homeDirectory;
    }

    const remainder = candidate.slice(2);
    const normalizedRemainder = remainder.replace(/^[/\\]+/, "");

    if (!normalizedRemainder) {
        return homeDirectory;
    }

    return path.join(homeDirectory, normalizedRemainder);
}

function getEnvironmentCandidates(env) {
    const rawValue =
        env?.PRETTIER_PLUGIN_GML_PLUGIN_PATHS ??
        env?.PRETTIER_PLUGIN_GML_PLUGIN_PATH;

    const trimmed = getNonEmptyTrimmedString(rawValue);
    if (!trimmed) {
        return [];
    }

    return normalizeStringList(trimmed, {
        splitPattern: LIST_SPLIT_PATTERN,
        allowInvalidType: true
    });
}

function resolveCandidatePath(candidate) {
    if (!candidate) {
        return null;
    }

    if (Array.isArray(candidate)) {
        return resolveFromRepoRoot(...candidate);
    }

    if (typeof candidate === "string") {
        const trimmed = getNonEmptyTrimmedString(candidate);
        if (!trimmed) {
            return null;
        }

        const expanded = expandLeadingTilde(trimmed);

        if (path.isAbsolute(expanded)) {
            return expanded;
        }

        return resolveFromRepoRoot(expanded);
    }

    return null;
}

/**
 * Collect candidate inputs from call-site overrides, environment variables,
 * and workspace defaults. Returning a dedicated list keeps
 * {@link resolveCandidatePaths} focused on sequencing rather than array
 * assembly details.
 */
function collectCandidateInputs(options = {}) {
    const { env, candidates } = normalizeOptionsBag(options);
    return [
        ...toArray(candidates),
        ...getEnvironmentCandidates(env),
        ...DEFAULT_CANDIDATE_PLUGIN_PATHS
    ];
}

/**
 * Normalize the mixed candidate inputs into a deduplicated list of resolved
 * file-system paths. Centralizing the map/filter bookkeeping keeps the
 * orchestrator logic in {@link resolveCandidatePaths} at a consistent
 * abstraction level.
 */
function normalizeCandidatePaths(candidateInputs) {
    const resolvedCandidates = compactArray(
        candidateInputs.map((candidate) => resolveCandidatePath(candidate))
    );

    return uniqueArray(resolvedCandidates);
}

function resolveCandidatePaths(options = {}) {
    const candidateInputs = collectCandidateInputs(options);
    return normalizeCandidatePaths(candidateInputs);
}

function candidateExistsAsFile(candidate) {
    try {
        const stats = fs.statSync(candidate);
        return stats.isFile();
    } catch {
        return false;
    }
}

function findFirstExistingPath(candidates) {
    for (const candidate of candidates) {
        if (candidateExistsAsFile(candidate)) {
            return candidate;
        }
    }

    return null;
}

function createMissingEntryPointError(resolvedCandidates) {
    return new Error(
        "Unable to locate the Prettier plugin entry point. Expected one of: " +
            resolvedCandidates.join(", ")
    );
}

export function resolvePluginEntryPoint(options = {}) {
    const { env, candidates } = normalizeOptionsBag(options);
    const resolvedCandidates = resolveCandidatePaths({
        env: env ?? process.env,
        candidates
    });
    const existingPath = findFirstExistingPath(resolvedCandidates);

    if (existingPath) {
        return existingPath;
    }

    throw createMissingEntryPointError(resolvedCandidates);
}

export function importPluginModule(options = {}) {
    const pluginPath = resolvePluginEntryPoint(options);
    return import(pathToFileURL(pluginPath).href);
}
