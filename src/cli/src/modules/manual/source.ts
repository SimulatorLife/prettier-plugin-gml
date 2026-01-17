import fs from "node:fs/promises";
import path from "node:path";

import { Core } from "@gml-modules/core";

import {
    readPackageJson,
    resolveCandidateRoot,
    resolveFromRepoRoot,
    resolvePackageJsonPath
} from "../../shared/index.js";

const { assertNonEmptyString, getErrorMessageOrFallback, isFsErrorCode, resolveContainedRelativePath, toPosixPath } =
    Core;

export interface ManualSourceDescriptor {
    root: string;
    packageName: string | null;
    packageJson: Record<string, unknown> | null;
}

export interface ManualSourceResolverOptions {
    manualRoot?: string | null | undefined;
    manualPackage?: string | null | undefined;
}

export type ManualSourceResolver = (options?: ManualSourceResolverOptions) => Promise<ManualSourceDescriptor>;

const DEFAULT_MANUAL_ROOT = resolveFromRepoRoot("vendor", "GameMaker-Manual");

async function ensureDirectoryExists(root, { required, label }) {
    try {
        const stats = await fs.stat(root);
        if (!stats.isDirectory()) {
            throw new Error(`${label} '${root}' must point to a directory.`);
        }
        return true;
    } catch (error) {
        if (!required && isFsErrorCode(error, "ENOENT")) {
            return false;
        }

        const message = getErrorMessageOrFallback(error);
        throw new Error(`${label} '${root}' is unavailable. (${message})`);
    }
}

export async function resolveManualSource({ manualRoot, manualPackage }: ManualSourceResolverOptions = {}) {
    const candidate = resolveCandidateRoot(manualRoot);
    if (candidate) {
        await ensureDirectoryExists(candidate.root, {
            required: true,
            label: "Manual root"
        });

        return candidate;
    }

    const defaultRootCandidate = resolveCandidateRoot(DEFAULT_MANUAL_ROOT);
    if (
        defaultRootCandidate &&
        (await ensureDirectoryExists(defaultRootCandidate.root, {
            required: false,
            label: "Manual submodule"
        }))
    ) {
        return defaultRootCandidate;
    }

    if (!manualPackage) {
        throw new Error("Manual assets were not found. Provide --manual-root or initialize vendor/GameMaker-Manual.");
    }

    const normalizedPackageName = assertNonEmptyString(manualPackage, {
        name: "manualPackage",
        errorMessage: "Manual package name must be provided."
    });

    const packageJsonPath = resolvePackageJsonPath(normalizedPackageName, "manual");
    const packageJson = await readPackageJson(packageJsonPath);
    const root = path.dirname(packageJsonPath);

    return {
        root,
        packageName: normalizedPackageName,
        packageJson
    };
}

export async function readManualText(root, relativePath) {
    const absolutePath = path.resolve(root, relativePath);

    try {
        return await fs.readFile(absolutePath, "utf8");
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        throw new Error(`Failed to read manual asset '${relativePath}' from '${root}'. (${message})`);
    }
}

export async function readManualJson(root, relativePath) {
    const contents = await readManualText(root, relativePath);

    try {
        return JSON.parse(contents);
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        throw new Error(`Manual asset '${relativePath}' did not contain valid JSON. (${message})`);
    }
}

export function describeManualSource(source: ManualSourceDescriptor) {
    const { root, packageName, packageJson } = source;

    if (packageName) {
        const version = typeof packageJson?.version === "string" ? packageJson.version : undefined;
        return version ? `${packageName}@${version}` : packageName;
    }

    return root;
}

/**
 * Normalize the manual root path used within generated metadata payloads.
 *
 * When the manual root lives inside the repository tree, this emits a
 * repository-relative POSIX string so the generated artefacts avoid
 * environment-specific absolute paths. If the manual root sits outside the
 * repo, we fall back to the provided root with POSIX separators intact.
 *
 * @param source Descriptor for the resolved manual source.
 * @returns Normalized manual root representation for metadata.
 */
export function getManualRootMetadataPath(source: ManualSourceDescriptor) {
    const repoRoot = resolveFromRepoRoot();
    const relativeRoot = resolveContainedRelativePath(source.root, repoRoot);
    const candidate = relativeRoot === null ? source.root : relativeRoot === "" ? "." : relativeRoot;

    return toPosixPath(candidate);
}
