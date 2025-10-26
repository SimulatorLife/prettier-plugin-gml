import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
    createListSplitPattern,
    getNonEmptyTrimmedString,
    normalizeStringList,
    toArray,
    uniqueArray
} from "../shared/dependencies.js";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CLI_SRC_DIRECTORY = path.resolve(MODULE_DIRECTORY, "..");
const CLI_PACKAGE_DIRECTORY = path.resolve(CLI_SRC_DIRECTORY, "..");
const WORKSPACE_SOURCE_DIRECTORY = path.resolve(CLI_PACKAGE_DIRECTORY, "..");
const REPO_ROOT = path.resolve(WORKSPACE_SOURCE_DIRECTORY, "..");

// Default plugin entry points shipped within the workspace. Additional
// candidates can be provided via environment variables or call-site overrides.
const DEFAULT_CANDIDATE_PLUGIN_PATHS = Object.freeze([
    ["src", "plugin", "src", "gml.js"],
    ["src", "plugin", "src", "index.js"],
    ["src", "plugin", "index.js"]
]);

const LIST_SPLIT_PATTERN = createListSplitPattern(
    [",", path.delimiter].filter(Boolean)
);

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
        return path.resolve(REPO_ROOT, ...candidate);
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

        return path.resolve(REPO_ROOT, expanded);
    }

    return null;
}

function resolveCandidatePaths({ env, candidates } = {}) {
    const orderedCandidates = [
        ...toArray(candidates),
        ...getEnvironmentCandidates(env),
        ...DEFAULT_CANDIDATE_PLUGIN_PATHS
    ];

    const resolvedCandidates = orderedCandidates
        .map((candidate) => resolveCandidatePath(candidate))
        .filter(Boolean);

    return uniqueArray(resolvedCandidates);
}

function findFirstExistingPath(candidates) {
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
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

export function resolvePluginEntryPoint({ env, candidates } = {}) {
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
