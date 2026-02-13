import { existsSync } from "node:fs";
import path from "node:path";

import { Core } from "@gml-modules/core";

import { normalizeLintFilePath } from "../language/path-normalization.js";

function asDirectoryPath(projectPath: string): string {
    return projectPath.toLowerCase().endsWith(".yyp") ? path.dirname(projectPath) : projectPath;
}

export function resolveNearestProjectRoot(filePath: string, fallbackCwd: string): string {
    const normalizedFilePath = normalizeLintFilePath(filePath);
    const fileDirectory = path.dirname(normalizedFilePath);

    for (const directory of Core.walkAncestorDirectories(fileDirectory, { includeSelf: true })) {
        const candidateManifestPath = path.join(directory, `${path.basename(directory)}.yyp`);
        if (existsSync(candidateManifestPath)) {
            return directory;
        }
    }

    return normalizeLintFilePath(fallbackCwd);
}

export function resolveForcedProjectRoot(forcedProjectPath: string | null): string | null {
    if (!forcedProjectPath) {
        return null;
    }

    return normalizeLintFilePath(asDirectoryPath(forcedProjectPath));
}
