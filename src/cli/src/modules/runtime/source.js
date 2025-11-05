import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import {
    assertNonEmptyString,
    getErrorMessageOrFallback
} from "../dependencies.js";

const require = createRequire(import.meta.url);

function resolveCandidateRoot(runtimeRoot) {
    if (!runtimeRoot) {
        return null;
    }

    const normalized = path.resolve(runtimeRoot);
    return { root: normalized, packageName: null, packageJson: null };
}

function resolvePackageJsonPath(packageName) {
    try {
        return require.resolve(`${packageName}/package.json`);
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        throw new Error(
            `Unable to resolve runtime package '${packageName}'. Install it or pass --runtime-root. (${message})`
        );
    }
}

async function readPackageJson(packageJsonPath) {
    const contents = await fs.readFile(packageJsonPath, "utf8");
    return JSON.parse(contents);
}

export async function resolveRuntimeSource({
    runtimeRoot,
    runtimePackage = "gamemaker-html5"
} = {}) {
    const candidate = resolveCandidateRoot(runtimeRoot);
    if (candidate) {
        const stats = await fs.stat(candidate.root).catch((error) => {
            const message = getErrorMessageOrFallback(error);
            throw new Error(
                `Runtime root '${candidate.root}' is unavailable. (${message})`
            );
        });

        if (!stats.isDirectory()) {
            throw new Error(
                `Runtime root '${candidate.root}' must point to a directory.`
            );
        }

        return candidate;
    }

    const normalizedPackageName = assertNonEmptyString(runtimePackage, {
        name: "runtimePackage",
        errorMessage: "Runtime package name must be provided."
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

export function describeRuntimeSource({ root, packageName, packageJson }) {
    if (packageName) {
        const version = packageJson?.version;
        return version ? `${packageName}@${version}` : packageName;
    }

    return root;
}
