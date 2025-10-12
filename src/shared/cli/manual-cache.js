import path from "node:path";

export const MANUAL_CACHE_ROOT_ENV_VAR = "GML_MANUAL_CACHE_ROOT";

export function resolveManualCacheRoot({
    repoRoot,
    env = process.env,
    relativeFallback = ["scripts", "cache", "manual"]
} = {}) {
    if (!repoRoot) {
        throw new TypeError(
            "repoRoot must be provided to resolveManualCacheRoot."
        );
    }

    const override = env?.[MANUAL_CACHE_ROOT_ENV_VAR];
    if (typeof override === "string" && override.trim() !== "") {
        return path.resolve(repoRoot, override.trim());
    }

    return path.join(repoRoot, ...relativeFallback);
}
