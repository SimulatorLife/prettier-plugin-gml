import path from "node:path";

import { createAbortGuard } from "../../../shared/abort-utils.js";
import { isFsErrorCode, listDirectory } from "../../../shared/fs-utils.js";
import { toPosixPath } from "../../../shared/path-utils.js";

import {
    PROJECT_INDEX_BUILD_ABORT_MESSAGE,
    isProjectManifestPath
} from "./constants.js";

export async function scanProjectTree(
    projectRoot,
    fsFacade,
    metrics = null,
    options = {}
) {
    const { signal, ensureNotAborted } = createAbortGuard(options, {
        fallbackMessage: PROJECT_INDEX_BUILD_ABORT_MESSAGE
    });
    const yyFiles = [];
    const gmlFiles = [];
    const pending = ["."];

    while (pending.length > 0) {
        const relativeDir = pending.pop();
        const absoluteDir = path.join(projectRoot, relativeDir);
        ensureNotAborted();
        const entries = await listDirectory(fsFacade, absoluteDir, {
            signal
        });
        ensureNotAborted();
        metrics?.incrementCounter("io.directoriesScanned");

        for (const entry of entries) {
            const relativePath = path.join(relativeDir, entry);
            const absolutePath = path.join(projectRoot, relativePath);
            let stats;
            try {
                stats = await fsFacade.stat(absolutePath);
                ensureNotAborted();
            } catch (error) {
                if (isFsErrorCode(error, "ENOENT")) {
                    metrics?.incrementCounter("io.skippedMissingEntries");
                    continue;
                }
                throw error;
            }

            if (
                typeof stats?.isDirectory === "function" &&
                stats.isDirectory()
            ) {
                pending.push(relativePath);
                continue;
            }

            const relativePosix = toPosixPath(relativePath);
            const lowerPath = relativePosix.toLowerCase();
            if (
                lowerPath.endsWith(".yy") ||
                isProjectManifestPath(relativePosix)
            ) {
                yyFiles.push({
                    absolutePath,
                    relativePath: relativePosix
                });
                metrics?.incrementCounter("files.yyDiscovered");
            } else if (lowerPath.endsWith(".gml")) {
                gmlFiles.push({
                    absolutePath,
                    relativePath: relativePosix
                });
                metrics?.incrementCounter("files.gmlDiscovered");
            }
        }
    }

    yyFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    gmlFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return { yyFiles, gmlFiles };
}
