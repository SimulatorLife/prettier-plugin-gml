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
 * Parts extracted from a GameMaker object event file path.
 */
export interface ObjectEventParts {
    /** The GameMaker object name, e.g. `obj_player`. */
    objectName: string;
    /** The event file stem, e.g. `Step_0` or `Create_0`. */
    eventName: string;
}

/**
 * Extract object name and event name from normalized path segments when the
 * path is inside an `objects/<objectName>/` directory.
 *
 * Returns `null` for non-event paths (e.g. scripts).
 */
export function resolveObjectEventPartsFromSegments(segments: ReadonlyArray<string>): ObjectEventParts | null {
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

    return { objectName, eventName };
}

/**
 * Resolve an object event runtime identifier from previously normalized segments.
 */
export function resolveObjectRuntimeIdFromSegments(segments: ReadonlyArray<string>): string | null {
    const parts = resolveObjectEventPartsFromSegments(segments);
    if (!parts) {
        return null;
    }

    return `gml_Object_${parts.objectName}_${parts.eventName}`;
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
