import { readdir } from "node:fs/promises";
import path from "node:path";

import { loadFixtureProjectConfig } from "../config/index.js";
import type { FixtureAssertion, FixtureCase, FixtureProjectConfig } from "../types.js";

const GMLOOP_CONFIG_FILE_NAME = "gmloop.json";
const INPUT_FILE_NAME = "input.gml";
const EXPECTED_FILE_NAME = "expected.gml";
const PROJECT_DIRECTORY_NAME = "project";
const EXPECTED_DIRECTORY_NAME = "expected";
const LEGACY_FILE_PATTERNS = [
    /^options\.json$/u,
    /^fixed\.gml$/u,
    /^input\.fixed\.gml$/u,
    /^.+\.input\.gml$/u,
    /^.+\.output\.gml$/u
];

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

function findLegacyFixtureFiles(fileNames: ReadonlySet<string>): Array<string> {
    return [...fileNames].filter((fileName) => LEGACY_FILE_PATTERNS.some((pattern) => pattern.test(fileName)));
}

function validateTextFixtureCaseLayout(
    assertion: FixtureAssertion,
    fileNames: ReadonlySet<string>,
    directoryNames: ReadonlySet<string>
): Array<string> {
    const validationErrors: Array<string> = [];
    const allowedFiles = new Set([GMLOOP_CONFIG_FILE_NAME, INPUT_FILE_NAME]);

    if (assertion === "transform") {
        allowedFiles.add(EXPECTED_FILE_NAME);
    }

    if (!fileNames.has(INPUT_FILE_NAME)) {
        validationErrors.push(`missing ${INPUT_FILE_NAME}`);
    }

    if (assertion === "transform" && !fileNames.has(EXPECTED_FILE_NAME)) {
        validationErrors.push(`missing ${EXPECTED_FILE_NAME}`);
    }

    if ((assertion === "idempotent" || assertion === "parse-error") && fileNames.has(EXPECTED_FILE_NAME)) {
        validationErrors.push(`${EXPECTED_FILE_NAME} is not allowed for ${assertion} fixtures`);
    }

    if (assertion === "project-tree") {
        validationErrors.push("project-tree assertion is only valid for refactor fixtures");
    }

    const unexpectedFiles = [...fileNames].filter((fileName) => !allowedFiles.has(fileName));
    const legacyFiles = findLegacyFixtureFiles(fileNames);
    validationErrors.push(
        ...legacyFiles.map((fileName) => `legacy fixture file ${JSON.stringify(fileName)} is not allowed`),
        ...unexpectedFiles.map((fileName) => `unexpected file ${JSON.stringify(fileName)}`),
        ...[...directoryNames].map((directoryName) => `unexpected directory ${JSON.stringify(directoryName)}`)
    );

    return validationErrors;
}

function validateRefactorFixtureCaseLayout(
    assertion: FixtureAssertion,
    fileNames: ReadonlySet<string>,
    directoryNames: ReadonlySet<string>
): Array<string> {
    const validationErrors: Array<string> = [];
    const allowedFiles = new Set([GMLOOP_CONFIG_FILE_NAME]);
    const allowedDirectories = new Set([PROJECT_DIRECTORY_NAME, EXPECTED_DIRECTORY_NAME]);

    if (assertion !== "project-tree") {
        validationErrors.push("refactor fixtures must use the project-tree assertion");
    }

    if (!directoryNames.has(PROJECT_DIRECTORY_NAME)) {
        validationErrors.push(`missing ${PROJECT_DIRECTORY_NAME}/ directory`);
    }
    if (!directoryNames.has(EXPECTED_DIRECTORY_NAME)) {
        validationErrors.push(`missing ${EXPECTED_DIRECTORY_NAME}/ directory`);
    }

    const unexpectedFiles = [...fileNames].filter((fileName) => !allowedFiles.has(fileName));
    const legacyFiles = findLegacyFixtureFiles(fileNames);
    validationErrors.push(
        ...legacyFiles.map((fileName) => `legacy fixture file ${JSON.stringify(fileName)} is not allowed`),
        ...unexpectedFiles.map((fileName) => `unexpected file ${JSON.stringify(fileName)}`),
        ...[...directoryNames]
            .filter((directoryName) => !allowedDirectories.has(directoryName))
            .map((directoryName) => `unexpected directory ${JSON.stringify(directoryName)}`)
    );

    return validationErrors;
}

async function createFixtureCase(rootPath: string, fixturePath: string): Promise<FixtureCase> {
    const configPath = path.join(fixturePath, GMLOOP_CONFIG_FILE_NAME);
    const config = await loadFixtureProjectConfig(configPath);
    const entries = await readdir(fixturePath, { withFileTypes: true });
    const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    const directoryNames = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    const assertion = deriveDefaultAssertion(config, fileNames);
    const validationErrors =
        config.fixture.kind === "refactor"
            ? validateRefactorFixtureCaseLayout(assertion, fileNames, directoryNames)
            : validateTextFixtureCaseLayout(assertion, fileNames, directoryNames);

    if (
        config.fixture.kind !== "refactor" &&
        config.fixture.kind !== "format" &&
        config.fixture.kind !== "lint" &&
        config.fixture.kind !== "integration"
    ) {
        validationErrors.push(`unsupported fixture kind ${JSON.stringify(config.fixture.kind)}`);
    }

    if (validationErrors.length > 0) {
        throw new Error(`${normalizeCaseId(rootPath, fixturePath)}: ${validationErrors.join(", ")}`);
    }

    return Object.freeze({
        caseId: normalizeCaseId(rootPath, fixturePath),
        fixturePath,
        configPath,
        config,
        kind: config.fixture.kind,
        assertion,
        inputFilePath: config.fixture.kind === "refactor" ? null : path.join(fixturePath, INPUT_FILE_NAME),
        expectedFilePath:
            config.fixture.kind === "refactor" || !fileNames.has(EXPECTED_FILE_NAME)
                ? null
                : path.join(fixturePath, EXPECTED_FILE_NAME),
        projectDirectoryPath:
            config.fixture.kind === "refactor" ? path.join(fixturePath, PROJECT_DIRECTORY_NAME) : null,
        expectedDirectoryPath:
            config.fixture.kind === "refactor" ? path.join(fixturePath, EXPECTED_DIRECTORY_NAME) : null
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
    const settledCases = await Promise.allSettled(
        caseDirectories.map((fixturePath) => createFixtureCase(fixtureRoot, fixturePath))
    );
    const validationErrors = settledCases
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => {
            if (result.reason instanceof Error) {
                return result.reason.message;
            }

            return String(result.reason);
        });
    if (validationErrors.length > 0) {
        throw new Error(`Invalid fixture cases under ${fixtureRoot}:\n- ${validationErrors.join("\n- ")}`);
    }

    const fixtureCases = settledCases
        .filter((result): result is PromiseFulfilledResult<FixtureCase> => result.status === "fulfilled")
        .map((result) => result.value);
    return Object.freeze(fixtureCases);
}
