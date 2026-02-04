import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { Core } from "@gml-modules/core";

const {
    describeValueWithArticle,
    getErrorMessageOrFallback,
    getNonEmptyTrimmedString,
    isPlainObject,
    parseJsonObjectWithContext
} = Core;

const require = createRequire(import.meta.url);

const isPackageJsonRecord = (value: unknown): value is Record<string, unknown> => isPlainObject(value);

function describePackageJsonValue(value: unknown): string {
    return describeValueWithArticle(value, { emptyStringLabel: "an empty string" });
}

function buildPackageJsonObjectErrorMessage(packageJsonPath: string, payload: unknown): string {
    return `Expected package.json to contain an object at ${packageJsonPath}. Received ${describePackageJsonValue(
        payload
    )}.`;
}

function assertPackageJsonStringField(
    record: Record<string, unknown>,
    fieldName: string,
    packageJsonPath: string
): void {
    if (!Object.hasOwn(record, fieldName)) {
        return;
    }

    const rawValue = record[fieldName];
    const normalized = getNonEmptyTrimmedString(rawValue);
    if (!normalized) {
        throw new TypeError(
            `package.json field '${fieldName}' must be a non-empty string at ${packageJsonPath}. ` +
                `Received ${describePackageJsonValue(rawValue)}.`
        );
    }
}

function validatePackageJsonShape(record: Record<string, unknown>, packageJsonPath: string): Record<string, unknown> {
    assertPackageJsonStringField(record, "name", packageJsonPath);
    assertPackageJsonStringField(record, "version", packageJsonPath);
    return record;
}

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
    const parsed = parseJsonObjectWithContext(contents, {
        source: packageJsonPath,
        description: "package.json",
        createAssertOptions: (payload) => ({
            errorMessage: buildPackageJsonObjectErrorMessage(packageJsonPath, payload)
        })
    });

    if (!isPackageJsonRecord(parsed)) {
        throw new TypeError(buildPackageJsonObjectErrorMessage(packageJsonPath, parsed));
    }

    return validatePackageJsonShape(parsed, packageJsonPath);
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
