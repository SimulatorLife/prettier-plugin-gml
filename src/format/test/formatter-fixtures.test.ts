import assert from "node:assert/strict";
import fs from "node:fs/promises";
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

type FormatterFixtureCase = Readonly<{
    basename: string;
    inputPath: string;
    outputPath: string | null;
    optionsPath: string;
    kind: "paired" | "standalone";
}>;

async function discoverFormatterFixtureCases(): Promise<ReadonlyArray<FormatterFixtureCase>> {
    const entries = await fs.readdir(fixtureDirectory);
    const pairedInputBasenames = new Set<string>();
    const pairedOutputBasenames = new Set<string>();
    const standaloneBasenames = new Set<string>();
    const optionBasenames = new Set<string>();

    for (const entry of entries) {
        if (entry.endsWith(".input.gml")) {
            pairedInputBasenames.add(entry.slice(0, -".input.gml".length));
            continue;
        }

        if (entry.endsWith(".output.gml")) {
            pairedOutputBasenames.add(entry.slice(0, -".output.gml".length));
            continue;
        }

        if (entry.endsWith(".options.json")) {
            optionBasenames.add(entry.slice(0, -".options.json".length));
            continue;
        }

        if (entry.endsWith(".gml")) {
            standaloneBasenames.add(entry.slice(0, -".gml".length));
        }
    }

    const pairedBasenames = new Set([...pairedInputBasenames, ...pairedOutputBasenames]);
    for (const basename of pairedBasenames) {
        assert.equal(
            pairedInputBasenames.has(basename),
            true,
            `Formatter fixture '${basename}' is missing .input.gml in '${fixtureDirectory}'.`
        );
        assert.equal(
            pairedOutputBasenames.has(basename),
            true,
            `Formatter fixture '${basename}' is missing .output.gml in '${fixtureDirectory}'.`
        );
    }

    for (const basename of standaloneBasenames) {
        assert.equal(
            pairedBasenames.has(basename),
            false,
            `Formatter fixture '${basename}' cannot mix standalone .gml with paired .input/.output fixtures.`
        );
    }

    const fixtureBasenames = new Set([...pairedBasenames, ...standaloneBasenames]);
    for (const optionBasename of optionBasenames) {
        assert.equal(
            fixtureBasenames.has(optionBasename),
            true,
            `Formatter options file '${optionBasename}.options.json' has no matching fixture.`
        );
    }

    const pairedFixtureCases = [...pairedBasenames].toSorted().map((basename) =>
        Object.freeze({
            basename,
            inputPath: path.join(fixtureDirectory, `${basename}.input.gml`),
            outputPath: path.join(fixtureDirectory, `${basename}.output.gml`),
            optionsPath: path.join(fixtureDirectory, `${basename}.options.json`),
            kind: "paired" as const
        })
    );
    const standaloneFixtureCases = [...standaloneBasenames].toSorted().map((basename) =>
        Object.freeze({
            basename,
            inputPath: path.join(fixtureDirectory, `${basename}.gml`),
            outputPath: null,
            optionsPath: path.join(fixtureDirectory, `${basename}.options.json`),
            kind: "standalone" as const
        })
    );
    const fixtureCases = [...pairedFixtureCases, ...standaloneFixtureCases];

    for (const fixtureCase of fixtureCases) {
        await fs.access(fixtureCase.inputPath);
        if (fixtureCase.outputPath !== null) {
            await fs.access(fixtureCase.outputPath);
        }
    }

    return fixtureCases;
}

async function readFixtureText(
    fixtureCase: FormatterFixtureCase
): Promise<{ input: string; output: string | null; options: Record<string, unknown> | null }> {
    const [input, output] = await Promise.all([
        fs.readFile(fixtureCase.inputPath, fileEncoding),
        fixtureCase.outputPath === null ? Promise.resolve(null) : fs.readFile(fixtureCase.outputPath, fileEncoding)
    ]);
    let options: Record<string, unknown> | null = null;
    try {
        const serialized = await fs.readFile(fixtureCase.optionsPath, fileEncoding);
        const parsed = JSON.parse(serialized);
        if (parsed && typeof parsed === "object") {
            options = parsed as Record<string, unknown>;
        }
    } catch {
        options = null;
    }

    return { input, output, options };
}

const formatterFixtureCases = await discoverFormatterFixtureCases();

void test("discovers formatter fixture pairs", () => {
    assert.equal(formatterFixtureCases.length > 0, true, "Expected at least one formatter fixture pair.");
    assert.equal(
        formatterFixtureCases.some((fixtureCase) => fixtureCase.kind === "paired"),
        true,
        "Expected at least one paired formatter fixture."
    );
});

void describe("formatter fixtures", () => {
    for (const fixtureCase of formatterFixtureCases) {
        void it(`formats ${fixtureCase.basename}`, async () => {
            const fixture = await readFixtureText(fixtureCase);
            const formatted = await Format.format(fixture.input, fixture.options ?? {});

            if (fixtureCase.kind === "paired") {
                assert.notEqual(
                    fixture.output,
                    null,
                    `Expected paired formatter fixture '${fixtureCase.basename}' to include .output.gml content.`
                );
                assert.equal(
                    formatted.trim(),
                    fixture.output.trim(),
                    `${fixtureCase.basename} should match expected formatter output`
                );
            }
        });
    }
});
