import path from "node:path";

import { Core } from "@gml-modules/core";

const OBJECTS_DIRECTORY = "objects";
const SCRIPTS_DIRECTORY = "scripts";

/**
 * Return a normalized list of path segments suitable for runtime-id heuristics.
 */
export function getRuntimePathSegments(filePath: string): ReadonlyArray<string> {
    const normalizedPath = path.normalize(filePath);
    return Core.compactArray(normalizedPath.split(path.sep));
}

/**
 * Resolve an object event runtime identifier from previously normalized segments.
 */
export function resolveObjectRuntimeIdFromSegments(segments: ReadonlyArray<string>): string | null {
    const objectDirectoryIndex = segments.lastIndexOf(OBJECTS_DIRECTORY);
    if (objectDirectoryIndex === -1) {
        return null;
    }

    const objectName = segments[objectDirectoryIndex + 1];
    const eventFile = segments[objectDirectoryIndex + 2];
    if (!objectName || !eventFile) {
        return null;
    }

    const eventName = path.basename(eventFile, path.extname(eventFile));
    if (!eventName) {
        return null;
    }

    return `gml_Object_${objectName}_${eventName}`;
}

/**
 * Extract the script file basename from normalized segments when the path is inside scripts/.
 */
export function resolveScriptFileNameFromSegments(segments: ReadonlyArray<string>): string | null {
    const scriptDirectoryIndex = segments.lastIndexOf(SCRIPTS_DIRECTORY);
    if (scriptDirectoryIndex === -1) {
        return null;
    }

    const scriptFile = segments[scriptDirectoryIndex + 1];
    if (!scriptFile) {
        return null;
    }

    const scriptName = path.basename(scriptFile, path.extname(scriptFile));
    if (!scriptName) {
        return null;
    }

    return scriptName;
}
