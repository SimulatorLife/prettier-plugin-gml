import path from "node:path";
import { Core } from "@gml-modules/core";
import { PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE, createProjectIndexAbortGuard } from "./abort-guard.js";
import { isProjectManifestPath } from "./constants.js";
import { defaultFsFacade } from "./fs-facade.js";
import { listDirectory } from "./fs-helpers.js";
// Use canonical Core namespace access instead of destructuring
// - Core.FS.walkAncestorDirectories
export async function findProjectRoot(options, fsFacade = defaultFsFacade) {
    const filepath = options?.filepath;
    const { signal, ensureNotAborted } = createProjectIndexAbortGuard(options, {
        message: PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE
    });
    if (!filepath) {
        return null;
    }
    const startDirectory = path.dirname(path.resolve(filepath));
    for (const directory of Core.FS.walkAncestorDirectories(startDirectory)) {
        ensureNotAborted();
        const entries = await listDirectory(fsFacade, directory, { signal });
        ensureNotAborted();
        try {
            const sample = (entries || []).slice(0, 20).map(String);
            const matched = (entries || []).some(isProjectManifestPath);
            console.debug(`[DBG] findProjectRoot: grep dir=${directory} entriesCount=${(entries || []).length} matched=${matched} sample=${JSON.stringify(sample)}`);
        }
        catch {
            /* ignore */
        }
        if (entries.some(isProjectManifestPath)) {
            return directory;
        }
    }
    return null;
}
//# sourceMappingURL=project-root.js.map