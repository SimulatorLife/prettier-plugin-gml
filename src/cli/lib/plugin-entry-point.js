import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
    escapeRegExp,
    getNonEmptyTrimmedString,
    normalizeStringList,
    toArray
} from "./shared-deps.js";

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

function collectCandidatePaths({ env, candidates } = {}) {
    const explicitCandidates = toArray(candidates);
    const envCandidates = getEnvironmentCandidates(env);

    return [
        ...explicitCandidates,
        ...envCandidates,
        ...DEFAULT_CANDIDATE_PLUGIN_PATHS
    ];
}

export function resolvePluginEntryPoint({ env, candidates } = {}) {
    const orderedCandidates = collectCandidatePaths({
        env: env ?? process.env,
        candidates
    });
    const resolvedCandidates = [];

    for (const candidate of orderedCandidates) {
        const resolved = resolveCandidatePath(candidate);
        if (!resolved || resolvedCandidates.includes(resolved)) {
            continue;
        }

        resolvedCandidates.push(resolved);
        if (fs.existsSync(resolved)) {
            return resolved;
        }
    }

    throw new Error(
        "Unable to locate the Prettier plugin entry point. Expected one of: " +
            resolvedCandidates.join(", ")
    );
}
