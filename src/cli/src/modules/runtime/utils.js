import path from "node:path";

import { toTrimmedString } from "../dependencies.js";
import {
    
    
    
    
    normalizeManualRepository as normalizeRuntimeRepository
} from "../manual/utils.js";

export const RUNTIME_REPO_ENV_VAR = "GML_RUNTIME_REPO";
export const RUNTIME_CACHE_ROOT_ENV_VAR = "GML_RUNTIME_CACHE_ROOT";
export const DEFAULT_RUNTIME_REPO = "YoYoGames/GameMaker-HTML5";

export const RUNTIME_REPO_REQUIREMENT_SOURCE = Object.freeze({
    CLI: "cli",
    ENV: "env"
});

const RUNTIME_REPO_REQUIREMENTS = Object.freeze({
    [RUNTIME_REPO_REQUIREMENT_SOURCE.ENV]: `${RUNTIME_REPO_ENV_VAR} must specify a GitHub repository in 'owner/name' format`,
    [RUNTIME_REPO_REQUIREMENT_SOURCE.CLI]:
        "Runtime repository must be provided in 'owner/name' format"
});

const RUNTIME_REPO_REQUIREMENT_SOURCE_LIST = Object.values(
    RUNTIME_REPO_REQUIREMENT_SOURCE
).join(", ");

function getRuntimeRepoRequirement(source) {
    const requirement = RUNTIME_REPO_REQUIREMENTS[source];
    if (typeof requirement === "string") {
        return requirement;
    }

    const received = source === undefined ? "undefined" : `'${String(source)}'`;
    throw new TypeError(
        `Runtime repository requirement source must be one of: ${RUNTIME_REPO_REQUIREMENT_SOURCE_LIST}. Received ${received}.`
    );
}

function describeRuntimeRepoInput(value) {
    if (value == null) {
        return String(value);
    }

    return `'${String(value)}'`;
}

export function resolveRuntimeRepoValue(
    rawValue,
    { source = RUNTIME_REPO_REQUIREMENT_SOURCE.CLI } = {}
) {
    const requirement = getRuntimeRepoRequirement(source);
    const normalized = normalizeRuntimeRepository(rawValue);
    if (normalized) {
        return normalized;
    }

    const received = describeRuntimeRepoInput(rawValue);
    throw new TypeError(`${requirement} (received ${received}).`);
}

const DEFAULT_RUNTIME_REPO_NORMALIZED =
    resolveRuntimeRepoValue(DEFAULT_RUNTIME_REPO);

export function buildRuntimeRepositoryEndpoints(
    runtimeRepo = DEFAULT_RUNTIME_REPO
) {
    const useDefault =
        runtimeRepo === undefined || runtimeRepo === null || runtimeRepo === "";

    const normalized = useDefault
        ? DEFAULT_RUNTIME_REPO_NORMALIZED
        : resolveRuntimeRepoValue(runtimeRepo);

    return {
        runtimeRepo: normalized,
        apiRoot: `https://api.github.com/repos/${normalized}`,
        rawRoot: `https://raw.githubusercontent.com/${normalized}`
    };
}

export function resolveRuntimeCacheRoot({
    repoRoot,
    env = process.env,
    relativeFallback = ["scripts", "cache", "runtime"]
} = {}) {
    if (!repoRoot) {
        throw new TypeError(
            "repoRoot must be provided to resolveRuntimeCacheRoot."
        );
    }

    const override = toTrimmedString(env?.[RUNTIME_CACHE_ROOT_ENV_VAR]);
    if (override.length > 0) {
        return path.resolve(repoRoot, override);
    }

    return path.join(repoRoot, ...relativeFallback);
}


export {createManualGitHubCommitResolver as createRuntimeGitHubCommitResolver, createManualGitHubFileClient as createRuntimeGitHubFileClient, createManualGitHubRefResolver as createRuntimeGitHubRefResolver, createManualGitHubRequestDispatcher as createRuntimeGitHubRequestDispatcher, normalizeManualRepository as normalizeRuntimeRepository} from "../manual/utils.js";
