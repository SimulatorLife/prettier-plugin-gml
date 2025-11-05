import fs from "node:fs/promises";
import path from "node:path";

import { buildRuntimeRepositoryEndpoints } from "./utils.js";
import {
    createRuntimeEnvironmentContext,
    createRuntimeReferenceAccessContext
} from "./context.js";
import { ensureManualWorkflowArtifactsAllowed } from "../manual/workflow-access.js";
import {
    assertNonEmptyString,
    isFsErrorCode,
    toTrimmedString
} from "../dependencies.js";

const RUNTIME_REF_ENV_VAR = "GML_RUNTIME_REF";
const DEFAULT_RUNTIME_REF = "main";

function resolveRuntimeRefValue(rawValue) {
    const trimmed = toTrimmedString(rawValue);
    if (trimmed.length === 0) {
        return null;
    }

    return trimmed;
}

function createRuntimeVerboseState(verbose) {
    if (!verbose || typeof verbose !== "object") {
        return {
            resolveRef: false,
            downloads: false
        };
    }

    const resolveRef =
        verbose.resolveRef === undefined
            ? Boolean(verbose.all)
            : Boolean(verbose.resolveRef);
    const downloads =
        verbose.downloads === undefined
            ? Boolean(verbose.all)
            : Boolean(verbose.downloads);

    return {
        resolveRef,
        downloads
    };
}

async function pathExists(candidate) {
    try {
        await fs.access(candidate);
        return true;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return false;
        }

        throw error;
    }
}

async function downloadRuntimeArchive({
    archivePath,
    runtimeRepo,
    sha,
    userAgent,
    verbose
}) {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
        "User-Agent": userAgent,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const url = `https://codeload.github.com/${runtimeRepo}/zip/${sha}`;
    if (verbose.downloads) {
        console.log(`Downloading runtime archive from ${url}…`);
    }

    const response = await fetch(url, {
        headers,
        redirect: "follow"
    });

    if (!response.ok) {
        let message;
        try {
            message = await response.text();
        } catch {
            message = response.statusText;
        }

        throw new Error(
            `Failed to download runtime archive (HTTP ${response.status}): ${message}`
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.writeFile(archivePath, buffer);

    if (verbose.downloads) {
        console.log(`Saved runtime archive to ${archivePath}`);
    }
}

export async function ensureRuntimeArchiveHydrated({
    runtimeRef = resolveRuntimeRefValue(process.env[RUNTIME_REF_ENV_VAR]) ??
        DEFAULT_RUNTIME_REF,
    runtimeRepo,
    cacheRoot,
    userAgent,
    forceRefresh = false,
    verbose,
    workflowPathFilter,
    contextOptions = {}
} = {}) {
    const normalizedUserAgent = assertNonEmptyString(userAgent, {
        name: "userAgent",
        errorMessage: "Runtime archive hydration requires a userAgent string."
    });

    const options = {
        ...contextOptions,
        userAgent: normalizedUserAgent,
        runtimeRepo
    };

    const {
        environment: { defaultCacheRoot, repoRoot }
    } = createRuntimeEnvironmentContext({
        ...options,
        workflowPathFilter
    });

    const { resolveRuntimeRef } = createRuntimeReferenceAccessContext({
        ...options,
        workflowPathFilter
    });

    const { runtimeRepo: resolvedRepo, apiRoot } =
        buildRuntimeRepositoryEndpoints(runtimeRepo);

    const resolvedCacheRoot = cacheRoot
        ? path.isAbsolute(cacheRoot)
            ? cacheRoot
            : path.resolve(repoRoot, cacheRoot)
        : defaultCacheRoot;

    ensureManualWorkflowArtifactsAllowed(workflowPathFilter, {
        cacheRoot: resolvedCacheRoot,
        cacheLabel: "Runtime cache root"
    });

    const verboseState = createRuntimeVerboseState(verbose);
    const resolvedRef = await resolveRuntimeRef(runtimeRef, {
        verbose: { resolveRef: verboseState.resolveRef },
        apiRoot
    });

    const archiveRoot = path.join(resolvedCacheRoot, resolvedRef.sha);
    const archivePath = path.join(archiveRoot, "runtime.zip");

    if (!forceRefresh && (await pathExists(archivePath))) {
        if (verboseState.downloads) {
            console.log(
                `Runtime cache already contains archive for ${resolvedRef.sha}`
            );
        }

        return {
            archivePath,
            runtimeRepo: resolvedRepo,
            runtimeRef: resolvedRef,
            hydrated: true,
            downloaded: false
        };
    }

    if (forceRefresh && (await pathExists(archivePath))) {
        await fs.rm(archivePath, { force: true });
    }

    await downloadRuntimeArchive({
        archivePath,
        runtimeRepo: resolvedRepo,
        sha: resolvedRef.sha,
        userAgent: normalizedUserAgent,
        verbose: verboseState
    });

    return {
        archivePath,
        runtimeRepo: resolvedRepo,
        runtimeRef: resolvedRef,
        hydrated: true,
        downloaded: true
    };
}
