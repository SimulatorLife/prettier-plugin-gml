import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { Core } from "@gml-modules/core";
import { resolveFromRepoRoot } from "../../shared/workspace-paths.js";

const { assertNonEmptyString, getErrorMessageOrFallback, isFsErrorCode } = Core;

export interface ManualSourceDescriptor {
    root: string;
    packageName: string | null;
    packageJson: Record<string, unknown> | null;
}

export interface ManualSourceResolverOptions {
    manualRoot?: string | null | undefined;
    manualPackage?: string | null | undefined;
}

export type ManualSourceResolver = (
    options?: ManualSourceResolverOptions
) => Promise<ManualSourceDescriptor>;

const require = createRequire(import.meta.url);

const DEFAULT_MANUAL_ROOT = resolveFromRepoRoot("vendor", "GameMaker-Manual");

function resolveCandidateRoot(manualRoot) {
    if (!manualRoot) {
        return null;
    }

    const normalized = path.resolve(manualRoot);
    return { root: normalized, packageName: null, packageJson: null };
}

async function readPackageJson(packageJsonPath) {
    const contents = await fs.readFile(packageJsonPath, "utf8");
    return JSON.parse(contents);
}

function resolvePackageJsonPath(packageName) {
    try {
        return require.resolve(`${packageName}/package.json`);
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        throw new Error(
            `Unable to resolve manual package '${packageName}'. Install it or pass --manual-root. (${message})`
        );
    }
}

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

export async function resolveManualSource({
    manualRoot,
    manualPackage
}: ManualSourceResolverOptions = {}) {
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
        throw new Error(
            "Manual assets were not found. Provide --manual-root or initialize vendor/GameMaker-Manual."
        );
    }

    const normalizedPackageName = assertNonEmptyString(manualPackage, {
        name: "manualPackage",
        errorMessage: "Manual package name must be provided."
    });

    const packageJsonPath = resolvePackageJsonPath(normalizedPackageName);
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
        throw new Error(
            `Failed to read manual asset '${relativePath}' from '${root}'. (${message})`
        );
    }
}

export async function readManualJson(root, relativePath) {
    const contents = await readManualText(root, relativePath);

    try {
        return JSON.parse(contents);
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        throw new Error(
            `Manual asset '${relativePath}' did not contain valid JSON. (${message})`
        );
    }
}

export function describeManualSource(source: ManualSourceDescriptor) {
    const { root, packageName, packageJson } = source;

    if (packageName) {
        const version =
            typeof packageJson?.version === "string"
                ? packageJson.version
                : undefined;
        return version ? `${packageName}@${version}` : packageName;
    }

    return root;
}
