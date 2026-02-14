import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Plugin } from "../src/index.js";

const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
const currentDirectory = rawDirectory.includes(`${path.sep}dist${path.sep}`)
    ? path.resolve(rawDirectory, "..", "..", "test")
    : rawDirectory;
const fixtureDirectory = path.join(currentDirectory, "fixtures", "formatting");
const fileEncoding = "utf8";

const FORMATTER_FIXTURE_BASENAMES = Object.freeze([
    "testAligned",
    "testEmptyParamsComment",
    "testGM1017",
    "testIfBraces",
    "testIgnore",
    "testParams",
    "testPreserve",
    "testPrintWidth"
]);

async function readFixtureText(basename: string): Promise<{ input: string; output: string; options: Record<string, unknown> | null }> {
    const inputPath = path.join(fixtureDirectory, `${basename}.input.gml`);
    const outputPath = path.join(fixtureDirectory, `${basename}.output.gml`);
    const optionsPath = path.join(fixtureDirectory, `${basename}.options.json`);

    const [input, output] = await Promise.all([fs.readFile(inputPath, fileEncoding), fs.readFile(outputPath, fileEncoding)]);
    let options: Record<string, unknown> | null = null;
    try {
        const serialized = await fs.readFile(optionsPath, fileEncoding);
        const parsed = JSON.parse(serialized);
        if (parsed && typeof parsed === "object") {
            options = parsed as Record<string, unknown>;
        }
    } catch {
        options = null;
    }

    return { input, output, options };
}

void test("formatter-owned fixtures remain stable", async () => {
    for (const basename of FORMATTER_FIXTURE_BASENAMES) {
        const fixture = await readFixtureText(basename);
        const formatted = await Plugin.format(fixture.input, fixture.options ?? {});
        assert.equal(formatted.trim(), fixture.output.trim(), `${basename} should match expected formatter output`);
    }
});
