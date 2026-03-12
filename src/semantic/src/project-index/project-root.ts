import path from "node:path";

import { Core } from "@gml-modules/core";

import { createProjectIndexAbortGuard, PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE } from "./abort-guard.js";
import { isProjectManifestPath } from "./constants.js";
import { defaultFsFacade, type ProjectIndexFsFacade } from "./fs-facade.js";

// Use canonical Core namespace access instead of destructuring
// - Core.walkAncestorDirectories

export function findProjectRoot(
    options,
    fsFacade: Required<Pick<ProjectIndexFsFacade, "readDir">> = defaultFsFacade
): Promise<string | null> {
    let abortGuard: ReturnType<typeof createProjectIndexAbortGuard>;
    try {
        abortGuard = createProjectIndexAbortGuard(options, {
            message: PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE
        });
    } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    const { signal, ensureNotAborted } = abortGuard;
    const filepath = options?.filepath;

    if (!filepath) {
        return Promise.resolve(null);
    }

    const startDirectory = path.dirname(path.resolve(filepath));

    const directories = [...Core.walkAncestorDirectories(startDirectory)];
    return directories.reduce(
        (previousPromise, directory) =>
            previousPromise.then(async (found) => {
                if (found) {
                    return found;
                }

                ensureNotAborted();
                const entries = await Core.listDirectory(fsFacade, directory, {
                    signal
                });
                ensureNotAborted();

                if (entries.some(isProjectManifestPath)) {
                    return directory;
                }

                return null;
            }),
        Promise.resolve<string | null>(null)
    );
}
