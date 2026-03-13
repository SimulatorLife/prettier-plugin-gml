import { readdir } from "node:fs/promises";
import path from "node:path";

import { loadFixtureProjectConfig } from "../config/index.js";
import type { FixtureAssertion, FixtureCase, FixtureProjectConfig } from "../types.js";

const GMLOOP_CONFIG_FILE_NAME = "gmloop.json";
const EXPECTED_FILE_NAME = "expected.gml";

function normalizeCaseId(rootPath: string, fixturePath: string): string {
    return path.relative(rootPath, fixturePath).split(path.sep).join("/");
}

function deriveDefaultAssertion(config: FixtureProjectConfig, fileNames: ReadonlySet<string>): FixtureAssertion {
    if (config.fixture.assertion) {
        return config.fixture.assertion;
    }

    if (config.fixture.kind === "refactor") {
        return "project-tree";
    }

    if (fileNames.has(EXPECTED_FILE_NAME)) {
        return "transform";
    }

    return "idempotent";
}

async function collectCaseDirectories(rootPath: string): Promise<Array<string>> {
    const discoveredCaseDirectories: Array<string> = [];

    async function walk(currentPath: string): Promise<void> {
        const entries = await readdir(currentPath, { withFileTypes: true });
        const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

        if (fileNames.has(GMLOOP_CONFIG_FILE_NAME)) {
            discoveredCaseDirectories.push(currentPath);
            return;
        }

        await Promise.all(
            entries.filter((entry) => entry.isDirectory()).map((entry) => walk(path.join(currentPath, entry.name)))
        );
    }

    await walk(rootPath);
    return discoveredCaseDirectories.sort((left, right) => left.localeCompare(right));
}

async function createFixtureCase(rootPath: string, fixturePath: string): Promise<FixtureCase> {
    const configPath = path.join(fixturePath, GMLOOP_CONFIG_FILE_NAME);
    const config = await loadFixtureProjectConfig(configPath);
    const entries = await readdir(fixturePath, { withFileTypes: true });
    const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    const directoryNames = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    const assertion = deriveDefaultAssertion(config, fileNames);
    const validationErrors: Array<string> = [];

    if (config.fixture.kind === "refactor") {
        if (!directoryNames.has("project")) {
            validationErrors.push("missing project/ directory");
        }
        if (!directoryNames.has("expected")) {
            validationErrors.push("missing expected/ directory");
        }
    } else {
        if (!fileNames.has("input.gml")) {
            validationErrors.push("missing input.gml");
        }

        if (assertion === "transform" && !fileNames.has(EXPECTED_FILE_NAME)) {
            validationErrors.push(`missing ${EXPECTED_FILE_NAME}`);
        }
    }

    if (validationErrors.length > 0) {
        throw new Error(
            `Invalid fixture case ${normalizeCaseId(rootPath, fixturePath)}: ${validationErrors.join(", ")}`
        );
    }

    return Object.freeze({
        caseId: normalizeCaseId(rootPath, fixturePath),
        fixturePath,
        configPath,
        config,
        kind: config.fixture.kind,
        assertion,
        inputFilePath: config.fixture.kind === "refactor" ? null : path.join(fixturePath, "input.gml"),
        expectedFilePath:
            config.fixture.kind === "refactor" || !fileNames.has(EXPECTED_FILE_NAME)
                ? null
                : path.join(fixturePath, EXPECTED_FILE_NAME),
        projectDirectoryPath: config.fixture.kind === "refactor" ? path.join(fixturePath, "project") : null,
        expectedDirectoryPath: config.fixture.kind === "refactor" ? path.join(fixturePath, "expected") : null
    });
}

/**
 * Discover directory-per-case fixtures rooted at {@link fixtureRoot}.
 *
 * @param fixtureRoot Root directory containing fixture case subdirectories.
 * @returns Normalized fixture case definitions.
 */
export async function discoverFixtureCases(fixtureRoot: string): Promise<ReadonlyArray<FixtureCase>> {
    const caseDirectories = await collectCaseDirectories(fixtureRoot);
    const fixtureCases = await Promise.all(
        caseDirectories.map((fixturePath) => createFixtureCase(fixtureRoot, fixturePath))
    );
    return Object.freeze(fixtureCases);
}
