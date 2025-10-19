import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildManualRepositoryEndpoints,
    createManualGitHubClient,
    resolveManualCacheRoot
} from "./manual-utils.js";

function assertFileUrl(value) {
    if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(
            "importMetaUrl must be provided as a file URL string."
        );
    }

    return value;
}

function assertUserAgent(value) {
    if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(
            "userAgent must be provided as a non-empty string."
        );
    }

    return value;
}

function resolveOutputPath(repoRoot, fileName) {
    if (typeof fileName !== "string" || fileName.length === 0) {
        return null;
    }

    return path.join(repoRoot, "resources", fileName);
}

/**
 * Normalize shared defaults used by manual-powered CLI commands.
 *
 * Centralises bootstrap logic so each command can focus on its own behaviour
 * while reusing consistent repository discovery, cache directories, and manual
 * client wiring.
 */
export function createManualCommandContext({
    importMetaUrl,
    userAgent,
    outputFileName,
    repoRootSegments = ["..", ".."]
} = {}) {
    const normalizedUrl = assertFileUrl(importMetaUrl);
    const filename = fileURLToPath(normalizedUrl);
    const dirname = path.dirname(filename);
    const repoRoot = path.resolve(dirname, ...repoRootSegments);
    const defaultCacheRoot = resolveManualCacheRoot({ repoRoot });
    const { rawRoot: defaultManualRawRoot } = buildManualRepositoryEndpoints();

    const manualClient = createManualGitHubClient({
        userAgent: assertUserAgent(userAgent),
        defaultCacheRoot,
        defaultRawRoot: defaultManualRawRoot
    });

    return {
        repoRoot,
        defaultCacheRoot,
        defaultManualRawRoot,
        defaultOutputPath: resolveOutputPath(repoRoot, outputFileName),
        manualClient,
        fetchManualFile: manualClient.fileFetcher.fetchManualFile,
        resolveManualRef: manualClient.refResolver.resolveManualRef
    };
}
