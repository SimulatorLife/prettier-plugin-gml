import path from "node:path";
import { createRequire } from "node:module";
import process from "node:process";

import { getNonEmptyTrimmedString } from "../shared/dependencies.js";
import { CLI_PACKAGE_DIRECTORY, REPO_ROOT } from "../shared/workspace-paths.js";

const require = createRequire(import.meta.url);

const FALLBACK_CLI_VERSION_LABEL = "development build";

const PACKAGE_VERSION_CANDIDATES = Object.freeze([
    path.resolve(CLI_PACKAGE_DIRECTORY, "package.json"),
    path.resolve(REPO_ROOT, "package.json"),
    path.resolve(REPO_ROOT, "src", "plugin", "package.json")
]);

function normalizeVersionValue(value: unknown): string | null {
    return getNonEmptyTrimmedString(value);
}

function readPackageVersion(candidate: string): string | null {
    try {
        const packageJson = require(candidate) as { version?: unknown };
        return normalizeVersionValue(packageJson?.version);
    } catch {
        return null;
    }
}

export function resolveCliVersion(): string {
    const envCandidates: Array<string | undefined> = [
        process.env.PRETTIER_PLUGIN_GML_VERSION,
        process.env.npm_package_version
    ];

    for (const candidate of envCandidates) {
        const version = normalizeVersionValue(candidate);
        if (version) {
            return version;
        }
    }

    for (const packagePath of PACKAGE_VERSION_CANDIDATES) {
        const version = readPackageVersion(packagePath);
        if (version) {
            return version;
        }
    }

    return FALLBACK_CLI_VERSION_LABEL;
}

export { FALLBACK_CLI_VERSION_LABEL };
