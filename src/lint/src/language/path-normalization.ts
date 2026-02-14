import { realpathSync } from "node:fs";
import path from "node:path";

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
    const resolved = path.resolve(filename);

    let canonical = resolved;
    try {
        canonical = realpathSync.native(resolved);
    } catch {
        // Preserve the original absolute path when realpath fails (e.g. missing file).
    }

    return trimTrailingSeparators(canonical);
}
