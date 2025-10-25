import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
    escapeRegExp,
    getNonEmptyTrimmedString,
    normalizeStringList,
    toArray,
    uniqueArray
} from "../shared/dependencies.js";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIRECTORY = path.resolve(MODULE_DIRECTORY, "..");
const REPO_ROOT = path.resolve(CLI_DIRECTORY, "..");

// Default plugin entry points shipped within the workspace. Additional
// candidates can be provided via environment variables or call-site overrides.
const DEFAULT_CANDIDATE_PLUGIN_PATHS = Object.freeze([
    ["plugin", "src", "gml.js"],
    ["plugin", "src", "index.js"],
    ["plugin", "index.js"]
]);

const LIST_SEPARATORS = Array.from(
    new Set([",", path.delimiter].filter(Boolean))
);

const LIST_SPLIT_PATTERN = new RegExp(
    `[${LIST_SEPARATORS.map((separator) => escapeRegExp(separator)).join("")}]+`
);

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

        if (path.isAbsolute(trimmed)) {
            return trimmed;
        }

        return path.resolve(REPO_ROOT, trimmed);
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
