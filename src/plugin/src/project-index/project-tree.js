import path from "node:path";

import { isFsErrorCode, listDirectory, toPosixPath } from "../shared/index.js";

import { createProjectIndexAbortGuard } from "./abort-guard.js";
import {
    normalizeProjectFileCategory,
    resolveProjectFileCategory,
    ProjectFileCategory
} from "./project-file-categories.js";

function createProjectTreeCollector(metrics = null) {
    const yyFiles = [];
    const gmlFiles = [];

    function recordFile(category, record) {
        const normalizedCategory = normalizeProjectFileCategory(category);

        if (normalizedCategory === ProjectFileCategory.RESOURCE_METADATA) {
            yyFiles.push(record);
            metrics?.counters?.increment("files.yyDiscovered");
            return;
        }

        if (normalizedCategory === ProjectFileCategory.SOURCE) {
            gmlFiles.push(record);
            metrics?.counters?.increment("files.gmlDiscovered");
            return;
        }
    }

    function createRecord(absolutePath, relativePosix) {
        return {
            absolutePath,
            relativePath: relativePosix
        };
    }

    function register(relativePosix, absolutePath) {
        const category = resolveProjectFileCategory(relativePosix);
        if (!category) {
            return;
        }

        recordFile(category, createRecord(absolutePath, relativePosix));
    }

    function snapshot() {
        yyFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        gmlFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

        return { yyFiles, gmlFiles };
    }

    return {
        register,
        snapshot
    };
}

function createDirectoryTraversal(projectRoot) {
    const pending = ["."];

    return {
        hasPending() {
            return pending.length > 0;
        },
        next() {
            if (pending.length === 0) {
                return null;
            }

            const relativePath = pending.pop();
            return {
                relativePath,
                absolutePath: path.join(projectRoot, relativePath)
            };
        },
        enqueue(relativePath) {
            pending.push(relativePath);
        }
    };
}

function createDirectoryEntryDescriptor(directoryContext, entry, projectRoot) {
    const relativePath = path.join(directoryContext.relativePath, entry);
    const absolutePath = path.join(projectRoot, relativePath);

    return {
        relativePath,
        absolutePath,
        relativePosix: toPosixPath(relativePath)
    };
}

async function resolveDirectoryListing({
    directoryContext,
    fsFacade,
    metrics,
    ensureNotAborted,
    signal
}) {
    ensureNotAborted();
    const entries = await listDirectory(
        fsFacade,
        directoryContext.absolutePath,
        {
            signal
        }
    );
    ensureNotAborted();
    metrics?.counters?.increment("io.directoriesScanned");
    return entries;
}

function isDirectoryStat(stats) {
    return typeof stats?.isDirectory === "function" && stats.isDirectory();
}

async function resolveEntryStats({
    absolutePath,
    fsFacade,
    ensureNotAborted,
    metrics,
    signal
}) {
    try {
        const stats = await fsFacade.stat(absolutePath);
        ensureNotAborted();
        return stats;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            metrics?.counters?.increment("io.skippedMissingEntries");
            return null;
        }
        throw error;
    }
}

async function processDirectoryEntries({
    entries,
    directoryContext,
    traversal,
    collector,
    projectRoot,
    fsFacade,
    ensureNotAborted,
    metrics,
    signal
}) {
    for (const entry of entries) {
        ensureNotAborted();
        const descriptor = createDirectoryEntryDescriptor(
            directoryContext,
            entry,
            projectRoot
        );
        const stats = await resolveEntryStats({
            absolutePath: descriptor.absolutePath,
            fsFacade,
            ensureNotAborted,
            metrics,
            signal
        });

        if (!stats) {
            continue;
        }

        if (isDirectoryStat(stats)) {
            traversal.enqueue(descriptor.relativePath);
            continue;
        }

        collector.register(descriptor.relativePosix, descriptor.absolutePath);
    }
}

export async function scanProjectTree(
    projectRoot,
    fsFacade,
    metrics = null,
    options = {}
) {
    const { signal, ensureNotAborted } = createProjectIndexAbortGuard(options);
    const traversal = createDirectoryTraversal(projectRoot);
    const collector = createProjectTreeCollector(metrics);

    while (traversal.hasPending()) {
        const directoryContext = traversal.next();
        if (!directoryContext) {
            continue;
        }

        const entries = await resolveDirectoryListing({
            directoryContext,
            fsFacade,
            metrics,
            ensureNotAborted,
            signal
        });

        await processDirectoryEntries({
            entries,
            directoryContext,
            traversal,
            collector,
            projectRoot,
            fsFacade,
            ensureNotAborted,
            metrics,
            signal
        });
    }

    return collector.snapshot();
}
