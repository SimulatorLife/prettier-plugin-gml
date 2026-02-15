import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Plugin } from "@gml-modules/plugin";

const fileEncoding: BufferEncoding = "utf8";
const fixtureExtension = ".gml";
const DOC_COMMENT_PATTERN = /^\s*\/\/\/\s*@/i;
const INTEGRATION_FIXTURE_NAMES = new Set([
    "testComments",
    "testFoo",
    "testFormatting",
    "testFunctions",
    "testGM1012",
    "testGM1100",
    "testGlobalVars"
]);
const STRICT_EXPECTATION_FIXTURE_NAMES = new Set<string>();
const EXPECTED_PARSE_ERROR_FIXTURE_NAMES = new Set(["testGM1012", "testGM1100"]);

const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixtureDirectory = rawDirectory.includes(`${path.sep}dist${path.sep}`)
    ? path.resolve(rawDirectory, "..", "fixtures", "plugin-integration")
    : path.resolve(rawDirectory, "fixtures", "plugin-integration");

type IntegrationCase = {
    baseName: string;
    inputSource: string;
    expectedOutput: string;
    options: Record<string, unknown> | null;
};

type IntegrationCaseFiles = {
    inputFile?: string;
    outputFile?: string;
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error;
}

function removeDocCommentLines(text: string): string {
    return text
        .split(/\r?\n/)
        .filter((line) => !DOC_COMMENT_PATTERN.test(line))
        .join("\n");
}

function canonicalizeFixtureText(text: string): string {
    return removeDocCommentLines(text).trim();
}

async function readFixture(filePath: string): Promise<string> {
    const contents = await fs.readFile(filePath, fileEncoding);
    if (typeof contents !== "string") {
        throw new TypeError(`Expected fixture '${filePath}' to be read as a string.`);
    }

    return contents.trim();
}

async function tryLoadOptions(baseName: string): Promise<Record<string, unknown> | null> {
    const optionsFile = `${baseName}.options.json`;
    const optionsPath = path.join(fixtureDirectory, optionsFile);

    try {
        const contents = await fs.readFile(optionsPath, fileEncoding);
        if (!contents) {
            return null;
        }

        const parsed = JSON.parse(contents) as unknown;
        if (parsed && typeof parsed === "object") {
            return parsed as Record<string, unknown>;
        }
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return null;
        }

        throw error;
    }

    return null;
}

async function loadIntegrationCases(): Promise<Array<IntegrationCase>> {
    const entries = await fs.readdir(fixtureDirectory);
    const caseMap = new Map<string, IntegrationCaseFiles>();

    for (const entry of entries) {
        if (!entry.endsWith(fixtureExtension)) {
            continue;
        }

        if (entry.endsWith(`.input${fixtureExtension}`)) {
            const baseName = entry.replace(`.input${fixtureExtension}`, "");
            if (!INTEGRATION_FIXTURE_NAMES.has(baseName)) {
                continue;
            }

            const existing = caseMap.get(baseName) ?? {};
            caseMap.set(baseName, { ...existing, inputFile: entry });
            continue;
        }

        if (entry.endsWith(`.output${fixtureExtension}`)) {
            const baseName = entry.replace(`.output${fixtureExtension}`, "");
            if (!INTEGRATION_FIXTURE_NAMES.has(baseName)) {
                continue;
            }

            const existing = caseMap.get(baseName) ?? {};
            caseMap.set(baseName, { ...existing, outputFile: entry });
        }
    }

    return Promise.all(
        [...caseMap.keys()].toSorted().map(async (baseName) => {
            const caseFiles = caseMap.get(baseName);
            if (!caseFiles) {
                throw new Error(`Fixture '${baseName}' could not be loaded from case map.`);
            }

            const { inputFile, outputFile } = caseFiles;
            if (!inputFile || !outputFile) {
                throw new Error(`Fixture '${baseName}' is missing its ${inputFile ? "output" : "input"} file.`);
            }

            const inputPath = path.join(fixtureDirectory, inputFile);
            const outputPath = path.join(fixtureDirectory, outputFile);
            const [inputSource, expectedOutput, options] = await Promise.all([
                fs.readFile(inputPath, fileEncoding),
                readFixture(outputPath),
                tryLoadOptions(baseName)
            ]);

            return {
                baseName,
                inputSource,
                expectedOutput,
                options
            };
        })
    );
}

const integrationCases = await loadIntegrationCases();

void describe("Plugin integration fixtures", () => {
    for (const { baseName, inputSource, expectedOutput, options } of integrationCases) {
        void it(`formats ${baseName}`, async () => {
            if (EXPECTED_PARSE_ERROR_FIXTURE_NAMES.has(baseName)) {
                await assert.rejects(
                    Plugin.format(inputSource, options ?? undefined),
                    (error: unknown) =>
                        typeof error === "object" &&
                        error !== null &&
                        Reflect.get(error, "name") === "GameMakerSyntaxError"
                );
                return;
            }

            const formatted = await Plugin.format(inputSource, options ?? undefined);
            assert.equal(typeof formatted, "string");
            assert.notEqual(formatted.length, 0);

            if (STRICT_EXPECTATION_FIXTURE_NAMES.has(baseName)) {
                assert.strictEqual(canonicalizeFixtureText(formatted), canonicalizeFixtureText(expectedOutput));
            }
        });
    }
});
