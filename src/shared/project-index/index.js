import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";

export const PROJECT_MANIFEST_EXTENSION = ".yyp";

const defaultFsFacade = {
    async readDir(targetPath) {
        return fs.readdir(targetPath);
    },
    async stat(targetPath) {
        return fs.stat(targetPath);
    }
};

export function getDefaultFsFacade() {
    return defaultFsFacade;
}

function isManifestEntry(entry) {
    return (
        typeof entry === "string" &&
    entry.toLowerCase().endsWith(PROJECT_MANIFEST_EXTENSION)
    );
}

async function listDirectory(fsFacade, directoryPath) {
    try {
        return await fsFacade.readDir(directoryPath);
    } catch (error) {
        if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
            return [];
        }
        throw error;
    }
}

async function getFileMtime(fsFacade, filePath) {
    try {
        const stats = await fsFacade.stat(filePath);
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

export async function findProjectRoot(options, fsFacade = defaultFsFacade) {
    const filepath = options?.filepath;
    if (!filepath) {
        return null;
    }

    let current = path.dirname(path.resolve(filepath));
    const visited = new Set();

    while (!visited.has(current)) {
        visited.add(current);
        const entries = await listDirectory(fsFacade, current);
        const hasManifest = entries.some(isManifestEntry);
        if (hasManifest) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    return null;
}

export async function deriveCacheKey(
    { filepath, projectRoot, formatterVersion = "dev" },
    fsFacade = defaultFsFacade
) {
    const hash = createHash("sha256");
    hash.update(String(formatterVersion));
    hash.update("\0");

    const resolvedRoot = projectRoot ? path.resolve(projectRoot) : "";
    hash.update(resolvedRoot);
    hash.update("\0");

    if (resolvedRoot) {
        const entries = await listDirectory(fsFacade, resolvedRoot);
        const manifestNames = entries
            .filter(isManifestEntry)
            .sort((a, b) => a.localeCompare(b));

        for (const manifestName of manifestNames) {
            const manifestPath = path.join(resolvedRoot, manifestName);
            const mtime = await getFileMtime(fsFacade, manifestPath);
            if (mtime !== null) {
                hash.update(manifestName);
                hash.update("\0");
                hash.update(String(mtime));
                hash.update("\0");
            }
        }
    }

    if (filepath) {
        const resolvedFile = path.resolve(filepath);
        const mtime = await getFileMtime(fsFacade, resolvedFile);
        if (mtime !== null) {
            hash.update(
                path.relative(
                    resolvedRoot || path.parse(resolvedFile).root,
                    resolvedFile
                )
            );
            hash.update("\0");
            hash.update(String(mtime));
            hash.update("\0");
        }
    }

    return hash.digest("hex");
}

export async function loadProjectIndexCache(/* projectRoot, fsFacade = defaultFsFacade */) {
    // TODO: Load previously persisted project index metadata from disk.
    return null;
}

export async function saveProjectIndexCache(/* projectRoot, cacheData, fsFacade = defaultFsFacade */) {
    // TODO: Persist project index metadata so later formatter runs can reuse it.
}

export function createProjectIndexCoordinator() {
    // TODO: Track in-flight formatter runs so that multiple invocations can share
    // a single project index load.
    return {
        async ensureReady(/* projectRoot */) {
            // TODO: Implement coordination once the cache lifecycle is defined.
        }
    };
}
