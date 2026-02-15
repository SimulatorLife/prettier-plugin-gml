import { realpathSync } from "node:fs";
import path from "node:path";

import { Core } from "@gml-modules/core";

function isVirtualLintPath(filename: string): boolean {
    return filename.startsWith("<") && filename.endsWith(">") && filename.length > 1;
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
        // Preserve the original absolute path when realpath fails (e.g. missing file).
    }

    return Core.trimTrailingSeparators(canonical);
}
