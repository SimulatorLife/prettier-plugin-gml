import path from "node:path";

import { Core } from "@gml-modules/core";

import {
    PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE,
    createProjectIndexAbortGuard
} from "./abort-guard.js";
import { isProjectManifestPath } from "./constants.js";
import {
    defaultFsFacade,
    type ProjectIndexFsFacade
} from "./fs-facade.js";

// Use canonical Core namespace access instead of destructuring
// - Core.walkAncestorDirectories

export async function findProjectRoot(
    options,
    fsFacade: Required<Pick<ProjectIndexFsFacade, "readDir">> = defaultFsFacade
) {
    const filepath = options?.filepath;
    const { signal, ensureNotAborted } = createProjectIndexAbortGuard(options, {
        message: PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE
    });

    if (!filepath) {
        return null;
    }

    const startDirectory = path.dirname(path.resolve(filepath));

    for (const directory of Core.walkAncestorDirectories(startDirectory)) {
        ensureNotAborted();

        const entries = await Core.listDirectory(fsFacade, directory, {
            signal
        });
        ensureNotAborted();

        try {
            const sample = (entries || []).slice(0, 20).map(String);
            const matched = (entries || []).some(isProjectManifestPath);
            console.debug(
                `[DBG] findProjectRoot: grep dir=${directory} entriesCount=${(entries || []).length} matched=${matched} sample=${JSON.stringify(sample)}`
            );
        } catch {
            /* ignore */
        }

        if (entries.some(isProjectManifestPath)) {
            return directory;
        }
    }

    return null;
}
