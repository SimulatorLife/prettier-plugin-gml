import { realpathSync } from "node:fs";
import path from "node:path";

function isVirtualLintPath(filename: string): boolean {
    return filename.startsWith("<") && filename.endsWith(">") && filename.length > 1;
}

function isRootPath(candidate: string): boolean {
    return path.parse(candidate).root === candidate;
}

function trimTrailingSeparators(candidate: string): string {
    if (isRootPath(candidate)) {
        return candidate;
    }

    let current = candidate;
    while (current.endsWith(path.sep)) {
        current = current.slice(0, -path.sep.length);
    }

    return current;
}

export function normalizeLintFilePath(filename: string): string {
    if (isVirtualLintPath(filename)) {
        return filename;
    }

    const resolved = path.resolve(filename);

    let canonical = resolved;
    try {
        canonical = realpathSync.native(resolved);
    } catch {
        // Keep resolved path when canonical lookup fails.
    }

    return trimTrailingSeparators(canonical);
}
