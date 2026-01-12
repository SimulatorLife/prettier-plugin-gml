import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Core } from "@gml-modules/core";
import { resolveCandidateRoot, readPackageJson, resolvePackageJsonPath } from "../../shared/index.js";

const { assertNonEmptyString, getErrorMessageOrFallback } = Core;

const DEFAULT_VENDOR_RUNTIME_PATH = path.resolve(process.cwd(), "vendor", "GameMaker-HTML5");

export const DEFAULT_RUNTIME_PACKAGE = "gamemaker-html5";

async function resolveVendorRuntimeRoot() {
    try {
        const stats = await fs.stat(DEFAULT_VENDOR_RUNTIME_PATH);
        if (!stats.isDirectory()) {
            return null;
        }
    } catch {
        return null;
    }

    let packageJson = null;
    try {
        packageJson = await readPackageJson(path.join(DEFAULT_VENDOR_RUNTIME_PATH, "package.json"));
    } catch (error) {
        // Ignore missing or invalid package metadata in the vendor checkout.
        // The runtime resolution system can operate without package.json when
        // working with a local Git submodule checkout. If the metadata is absent
        // or malformed, the resolver falls back to using the vendored source
        // directly without version constraints. Debug logging below helps trace
        // resolution issues without failing the build.
        if (process.env.DEBUG_RUNTIME_RESOLUTION === "1") {
            const message = getErrorMessageOrFallback(error);
            console.debug(`Skipped runtime package metadata: ${message}`);
        }
    }

    return {
        root: DEFAULT_VENDOR_RUNTIME_PATH,
        packageName: null,
        packageJson
    };
}

export interface RuntimeSourceDescriptor {
    root: string;
    packageName: string | null;
    packageJson: Record<string, unknown> | null;
}

export interface RuntimeSourceResolverOptions {
    runtimeRoot?: string | null | undefined;
    runtimePackage?: string | undefined;
}

export type RuntimeSourceResolver = (options?: RuntimeSourceResolverOptions) => Promise<RuntimeSourceDescriptor>;

export async function resolveRuntimeSource({
    runtimeRoot,
    runtimePackage = DEFAULT_RUNTIME_PACKAGE
}: RuntimeSourceResolverOptions = {}) {
    const candidate = resolveCandidateRoot(runtimeRoot);
    if (candidate) {
        const stats = await fs.stat(candidate.root).catch((error) => {
            const message = getErrorMessageOrFallback(error);
            throw new Error(`Runtime root '${candidate.root}' is unavailable. (${message})`);
        });

        if (!stats.isDirectory()) {
            throw new Error(`Runtime root '${candidate.root}' must point to a directory.`);
        }

        return candidate;
    }

    const vendorRuntime = await resolveVendorRuntimeRoot();
    if (vendorRuntime) {
        return vendorRuntime;
    }

    const normalizedPackageName = assertNonEmptyString(runtimePackage, {
        name: "runtimePackage",
        errorMessage: "Runtime package name must be provided."
    });

    const packageJsonPath = resolvePackageJsonPath(normalizedPackageName, "runtime");
    const packageJson = await readPackageJson(packageJsonPath);
    const root = path.dirname(packageJsonPath);

    return {
        root,
        packageName: normalizedPackageName,
        packageJson
    };
}

export function describeRuntimeSource(source: RuntimeSourceDescriptor) {
    const { root, packageName, packageJson } = source;

    if (packageName) {
        const version = packageJson?.version;
        if (Core.isNonEmptyString(version)) {
            return `${packageName}@${version}`;
        }

        return packageName;
    }

    return root;
}
