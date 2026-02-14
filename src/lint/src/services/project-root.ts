import { readdirSync } from "node:fs";
import path from "node:path";

import { Core } from "@gml-modules/core";

import { normalizeLintFilePath } from "../language/path-normalization.js";

function asDirectoryPath(projectPath: string): string {
    return projectPath.toLowerCase().endsWith(".yyp") ? path.dirname(projectPath) : projectPath;
}

function hasProjectManifestInDirectory(directoryPath: string): boolean {
    try {
        const entries = readdirSync(directoryPath, { withFileTypes: true });
        const manifests = entries
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".yyp"))
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right));
        return manifests.length > 0;
    } catch {
        return false;
    }
}

export function resolveNearestProjectRoot(filePath: string, fallbackCwd: string): string {
    const normalizedFilePath = normalizeLintFilePath(filePath);
    const fileDirectory = path.dirname(normalizedFilePath);

    for (const directory of Core.walkAncestorDirectories(fileDirectory, { includeSelf: true })) {
        if (hasProjectManifestInDirectory(directory)) {
            return normalizeLintFilePath(directory);
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
