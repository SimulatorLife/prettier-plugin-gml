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
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (segments[index] !== OBJECTS_DIRECTORY) {
            continue;
        }

        const objectName = segments[index + 1];
        const eventFile = segments[index + 2];
        if (!objectName || !eventFile) {
            continue;
        }

        const eventName = path.basename(eventFile, path.extname(eventFile));
        if (!eventName) {
            continue;
        }

        return `gml_Object_${objectName}_${eventName}`;
    }

    return null;
}

/**
 * Extract the script file basename from normalized segments when the path is inside scripts/.
 */
export function resolveScriptFileNameFromSegments(segments: ReadonlyArray<string>): string | null {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (segments[index] !== SCRIPTS_DIRECTORY) {
            continue;
        }

        const scriptFile = segments[index + 1];
        if (!scriptFile) {
            continue;
        }

        const scriptName = path.basename(scriptFile, path.extname(scriptFile));
        if (!scriptName) {
            continue;
        }

        return scriptName;
    }

    return null;
}
