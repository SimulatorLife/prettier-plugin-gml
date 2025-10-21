import path from "node:path";

import { toTrimmedString } from "../shared-deps.js";

export const MANUAL_CACHE_ROOT_ENV_VAR = "GML_MANUAL_CACHE_ROOT";

function createManualVerboseState({
    quiet = false,
    isTerminal = false,
    overrides
} = {}) {
    const state = {
        resolveRef: !quiet,
        downloads: !quiet,
        parsing: !quiet,
        progressBar: !quiet && isTerminal
    };

    if (!overrides || typeof overrides !== "object") {
        return state;
    }

    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) {
            state[key] = value;
        }
    }

    return state;
}

function resolveManualCacheRoot({
    repoRoot,
    env = process.env,
    relativeFallback = ["scripts", "cache", "manual"]
} = {}) {
    if (!repoRoot) {
        throw new TypeError(
            "repoRoot must be provided to resolveManualCacheRoot."
        );
    }

    const override = toTrimmedString(env?.[MANUAL_CACHE_ROOT_ENV_VAR]);
    if (override.length > 0) {
        return path.resolve(repoRoot, override);
    }

    return path.join(repoRoot, ...relativeFallback);
}

export { createManualVerboseState, resolveManualCacheRoot };

export {
    DEFAULT_MANUAL_REPO,
    MANUAL_REPO_ENV_VAR,
    MANUAL_REPO_REQUIREMENT_SOURCE,
    buildManualRepositoryEndpoints,
    normalizeManualRepository,
    resolveManualRepoValue,
    createManualGitHubRequestDispatcher,
    createManualGitHubCommitResolver,
    createManualGitHubRefResolver,
    createManualGitHubFileClient
} from "./github.js";
