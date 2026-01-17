import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { Core } from "@gml-modules/core";

const { getErrorMessageOrFallback } = Core;

const require = createRequire(import.meta.url);

export interface SourceDescriptor {
    root: string;
    packageName: string | null;
    packageJson: Record<string, unknown> | null;
}

/**
 * Resolve a candidate root path to a source descriptor.
 * Returns null if the provided root is falsy.
 */
export function resolveCandidateRoot(candidateRoot: string | null | undefined): SourceDescriptor | null {
    if (!candidateRoot) {
        return null;
    }

    const normalized = path.resolve(candidateRoot);
    return { root: normalized, packageName: null, packageJson: null };
}

/**
 * Read and parse a package.json file from the given path.
 */
export async function readPackageJson(packageJsonPath: string): Promise<Record<string, unknown>> {
    const contents = await fs.readFile(packageJsonPath, "utf8");
    return JSON.parse(contents);
}

/**
 * Resolve the path to a package's package.json file.
 * Throws if the package cannot be resolved.
 */
export function resolvePackageJsonPath(packageName: string, context: string): string {
    try {
        return require.resolve(`${packageName}/package.json`);
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        throw new Error(`Unable to resolve ${context} package '${packageName}'. (${message})`);
    }
}
