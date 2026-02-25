import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { describe, it, test } from "node:test";
import { fileURLToPath } from "node:url";

import { Format } from "../src/index.js";

const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
const currentDirectory = rawDirectory.includes(`${path.sep}dist${path.sep}`)
    ? path.resolve(rawDirectory, "..", "..", "test")
    : rawDirectory;
const fixtureDirectory = path.join(currentDirectory, "fixtures", "formatting");
const fileEncoding = "utf8";

type FixtureKind = "pair" | "single";

type FixtureShape = {
    baseName: string;
    kind: FixtureKind;
};

function discoverFixturesSync(): FixtureShape[] {
    const entries = fs.readdirSync(fixtureDirectory);
    const gmlFiles = entries.filter((e) => e.endsWith(".gml"));
    const basenames = new Map<string, FixtureKind>();
    for (const file of gmlFiles) {
        if (file.endsWith(".input.gml")) {
            const base = file.slice(0, -".input.gml".length);
            basenames.set(base, "pair");
        } else if (file.endsWith(".output.gml")) {
            // covered by the corresponding .input.gml entry
        } else {
            const base = file.slice(0, -".gml".length);
            if (!basenames.has(base)) {
                basenames.set(base, "single");
            }
        }
    }
    return [...basenames.entries()]
        .map(([baseName, kind]) => ({ baseName, kind }))
        .sort((a, b) => a.baseName.localeCompare(b.baseName));
}

async function readOptions(baseName: string): Promise<Record<string, unknown>> {
    const optionsPath = path.join(fixtureDirectory, `${baseName}.options.json`);
    try {
        const text = await fsp.readFile(optionsPath, fileEncoding);
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

const fixtures = discoverFixturesSync();

void test("discovers formatter fixture pairs", () => {
    assert.ok(fixtures.length > 0, "should discover at least one fixture");
    for (const { baseName, kind } of fixtures) {
        if (kind === "pair") {
            const inputPath = path.join(fixtureDirectory, `${baseName}.input.gml`);
            const outputPath = path.join(fixtureDirectory, `${baseName}.output.gml`);
            assert.ok(fs.existsSync(inputPath), `${baseName}.input.gml should exist`);
            assert.ok(fs.existsSync(outputPath), `${baseName}.output.gml should exist`);
        }
    }
});

void describe("formatter fixtures", () => {
    for (const { baseName, kind } of fixtures) {
        void it(`formats ${baseName}`, async () => {
            const options = await readOptions(baseName);
            if (kind === "pair") {
                const inputPath = path.join(fixtureDirectory, `${baseName}.input.gml`);
                const outputPath = path.join(fixtureDirectory, `${baseName}.output.gml`);
                const [input, expectedOutput] = await Promise.all([
                    fsp.readFile(inputPath, fileEncoding),
                    fsp.readFile(outputPath, fileEncoding)
                ]);
                const formatted = await Format.format(input, options);
                assert.equal(
                    formatted.trim(),
                    expectedOutput.trim(),
                    `${baseName} should match expected formatter output`
                );
                const reformatted = await Format.format(formatted, options);
                assert.equal(reformatted.trim(), formatted.trim(), `${baseName} should remain idempotent`);
            } else {
                const singlePath = path.join(fixtureDirectory, `${baseName}.gml`);
                const content = await fsp.readFile(singlePath, fileEncoding);
                const formatted = await Format.format(content, options);
                assert.equal(formatted.trim(), content.trim(), `${baseName} should be idempotent when formatted`);
            }
        });
    }
});
