import path from "node:path";

import { walkAncestorDirectories } from "../dependencies.js";
import {
    PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE,
    createProjectIndexAbortGuard
} from "./abort-guard.js";
import { isProjectManifestPath } from "./constants.js";
import { defaultFsFacade } from "./fs-facade.js";
import { listDirectory } from "./fs-helpers.js";

export async function findProjectRoot(options, fsFacade = defaultFsFacade) {
    const filepath = options?.filepath;
    const { signal, ensureNotAborted } = createProjectIndexAbortGuard(options, {
        message: PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE
    });

    if (!filepath) {
        return null;
    }

    const startDirectory = path.dirname(path.resolve(filepath));

    for (const directory of walkAncestorDirectories(startDirectory)) {
        ensureNotAborted();

        const entries = await listDirectory(fsFacade, directory, { signal });
        ensureNotAborted();

        if (entries.some(isProjectManifestPath)) {
            return directory;
        }
    }

    return null;
}
