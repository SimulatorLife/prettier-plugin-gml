import fs from "node:fs/promises";
import path from "node:path";

import { unzipSync } from "fflate";

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
            downloads: false,
            extract: false
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
    const extract =
        verbose.extract === undefined
            ? Boolean(verbose.all)
            : Boolean(verbose.extract);

    return {
        resolveRef,
        downloads,
        extract
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

function computeArchiveRootPrefix(entryNames) {
    let prefix = null;

    for (const rawName of entryNames) {
        if (typeof rawName !== "string" || rawName.length === 0) {
            continue;
        }

        const normalized = rawName.replaceAll("\\", "/");
        const segments = normalized.split("/");
        if (segments.length <= 1) {
            return null;
        }

        const head = segments[0];
        if (!head || head === "__MACOSX") {
            continue;
        }

        if (prefix === null) {
            prefix = head;
            continue;
        }

        if (prefix !== head) {
            return null;
        }
    }

    return prefix;
}

function sanitizeArchiveEntry(name, { prefix } = {}) {
    if (typeof name !== "string" || name.length === 0) {
        return null;
    }

    const normalized = name.replaceAll("\\", "/");
    const isDirectory = normalized.endsWith("/");
    let relative = normalized;

    if (prefix && relative.startsWith(`${prefix}/`)) {
        relative = relative.slice(prefix.length + 1);
    } else if (prefix && relative === prefix) {
        return null;
    }

    if (relative.startsWith("__MACOSX/")) {
        return null;
    }

    const segments = relative
        .split("/")
        .filter((segment) => segment && segment !== ".");
    if (segments.length === 0) {
        return null;
    }

    if (segments.includes("..")) {
        throw new Error(
            `Runtime archive entry contains unsafe path traversal: '${name}'.`
        );
    }

    const sanitizedPath = path.join(...segments);
    if (sanitizedPath.startsWith("..")) {
        throw new Error(
            `Normalized runtime archive entry resolves outside target directory: '${name}'.`
        );
    }

    return {
        relativePath: sanitizedPath,
        isDirectory
    };
}

async function extractRuntimeArchive({ archivePath, outputDir, verbose }) {
    const buffer = await fs.readFile(archivePath);
    const entries = unzipSync(new Uint8Array(buffer));
    const entryNames = Object.keys(entries);
    const prefix = computeArchiveRootPrefix(entryNames);

    try {
        await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
        // Ignore errors; directory may not exist yet.
    }

    await fs.mkdir(outputDir, { recursive: true });

    let writtenFiles = 0;

    try {
        for (const [name, contents] of Object.entries(entries)) {
            const entry = sanitizeArchiveEntry(name, { prefix });
            if (!entry) {
                continue;
            }

            const targetPath = path.join(outputDir, entry.relativePath);

            if (entry.isDirectory) {
                await fs.mkdir(targetPath, { recursive: true });
                continue;
            }

            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, Buffer.from(contents));
            writtenFiles++;
        }
    } catch (error) {
        await fs.rm(outputDir, { recursive: true, force: true });
        throw error;
    }

    if (verbose.extract) {
        console.log(
            `Extracted ${writtenFiles} runtime file${writtenFiles === 1 ? "" : "s"} to ${outputDir}`
        );
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

    const verboseState = createRuntimeVerboseState(verbose);
    const resolvedRef = await resolveRuntimeRef(runtimeRef, {
        verbose: { resolveRef: verboseState.resolveRef },
        apiRoot
    });

    const archiveRoot = path.join(resolvedCacheRoot, resolvedRef.sha);
    const archivePath = path.join(archiveRoot, "runtime.zip");
    const runtimeRoot = path.join(archiveRoot, "runtime");

    ensureManualWorkflowArtifactsAllowed(workflowPathFilter, {
        cacheRoot: resolvedCacheRoot,
        cacheLabel: "Runtime cache root",
        outputPath: runtimeRoot,
        outputLabel: "Runtime extract root"
    });

    if (forceRefresh) {
        await fs.rm(archiveRoot, { recursive: true, force: true });
    }

    await fs.mkdir(archiveRoot, { recursive: true });

    let downloaded = false;
    const archiveExists = await pathExists(archivePath);

    if (!archiveExists) {
        await downloadRuntimeArchive({
            archivePath,
            runtimeRepo: resolvedRepo,
            sha: resolvedRef.sha,
            userAgent: normalizedUserAgent,
            verbose: verboseState
        });
        downloaded = true;
    } else if (verboseState.downloads) {
        console.log(
            `Using cached runtime archive for ${resolvedRef.sha} at ${archivePath}`
        );
    }

    let extracted = false;
    const runtimeExists = await pathExists(runtimeRoot);

    if (!runtimeExists) {
        await extractRuntimeArchive({
            archivePath,
            outputDir: runtimeRoot,
            verbose: verboseState
        });
        extracted = true;
    } else if (verboseState.extract) {
        console.log(`Runtime files already extracted at ${runtimeRoot}`);
    }

    return {
        archivePath,
        runtimeRepo: resolvedRepo,
        runtimeRef: resolvedRef,
        runtimeRoot,
        hydrated: true,
        downloaded,
        extracted
    };
}
