export function createRuntimeCommandContextOptions({
    importMetaUrl,
    userAgent,
    repoRootSegments = ["..", "..", "..", ".."],
    cacheRootSegments = ["src", "cli", "cache", "runtime"]
} = {}) {
    return Object.freeze({
        importMetaUrl,
        userAgent,
        repoRootSegments,
        cacheRootSegments
    });
}
