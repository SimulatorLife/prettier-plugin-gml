import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

const __dirname = import.meta.dirname;

void test("treats undefined defaults as required when the signature omits the default", async () => {
    const source = ["/// @param foo", "function sample(foo = undefined) {", "    return foo;", "}", ""].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        applyFeatherFixes: true
    });

    const lines = formatted.split("\n");
    const paramLine = lines.find((line) => line.startsWith("/// @param"));
    assert.equal(
        paramLine,
        "/// @param foo",
        "Expected doc comments to omit optional syntax when undefined defaults are removed"
    );
    assert.match(
        formatted,
        /function sample\(foo\)/,
        "Expected the undefined default to be removed from the parameter list"
    );
});

void test("preserves optional annotations when parameters are explicitly documented as optional", async () => {
    const source = ["/// @param [foo]", "function sample(foo = undefined) {", "    return foo;", "}", ""].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        applyFeatherFixes: true
    });

    const lines = formatted.split("\n");
    const paramLine = lines.find((line) => line.startsWith("/// @param"));
    assert.equal(paramLine, "/// @param [foo]", "Expected explicit optional annotations to be preserved");
    assert.match(
        formatted,
        /function sample\(foo = undefined\)/,
        "Expected explicitly optional parameters to retain their undefined default"
    );
});

void test("omits optional syntax for synthesized docs with undefined defaults", async () => {
    const source = [
        "function choose_profile(settings, fallback = undefined) {",
        "    var config = settings ?? global.default_settings;",
        "    var themeCandidate = config.theme_override ?? fallback.theme_override;",
        "    var finalTheme = themeCandidate ?? global.theme_defaults;",
        "    if ((config ?? fallback) == undefined) {",
        '        return "guest";',
        "    }",
        '    return (config.profile ?? fallback.profile) ?? "guest";',
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
    });

    const lines = formatted.split("\n");
    const fallbackDocLine = lines.find((line) => line.startsWith("/// @param") && line.includes("fallback"));
    assert.equal(
        fallbackDocLine,
        "/// @param fallback",
        "Expected synthesized doc comments to document undefined defaults as required parameters"
    );
    assert.ok(
        lines.includes("function choose_profile(settings, fallback) {"),
        "Expected redundant undefined defaults to be omitted from function signatures"
    );
});

void test("retains optional syntax when constructors keep explicit undefined defaults", async () => {
    const source = ["function Shape(color = undefined) constructor {", "    self.color = color;", "}", ""].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
    });

    assert.ok(
        formatted.includes("/// @param [color]"),
        "Expected synthesized constructor docs to keep optional syntax when undefined defaults remain in the signature"
    );
});

void test("synthesized docs mark retained undefined defaults as optional", async () => {
    async function resolveFixture(name: string) {
        const candidates = [
            path.resolve(process.cwd(), "test", "fixtures", "plugin-integration", name),
            path.resolve(process.cwd(), "..", "..", "test", "fixtures", "plugin-integration", name),
            path.resolve(__dirname, "..", "..", "..", "test", "fixtures", "plugin-integration", name),
            path.resolve(__dirname, "..", "..", "..", "..", "test", "fixtures", "plugin-integration", name)
        ];

        const resolvedCandidates = await Promise.all(
            candidates.map(async (candidate) => {
                try {
                    const stat = await fs.stat(candidate);
                    return stat.isFile() ? candidate : null;
                } catch {
                    return null;
                }
            })
        );

        const fixturePath = resolvedCandidates.find((candidate) => candidate !== null);
        if (fixturePath) {
            return fixturePath;
        }

        throw new Error(`Unable to resolve integration fixture '${name}'.`);
    }

    const fixturePath = await resolveFixture("testFunctions.input.gml");
    const optionsPath = await resolveFixture("testFunctions.options.json");
    const [source, rawOptions] = await Promise.all([
        fs.readFile(fixturePath, "utf8"),
        fs.readFile(optionsPath, "utf8")
    ]);

    const options = JSON.parse(rawOptions);
    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        ...options
    });

    const paramLine = formatted.split("\n").find((line) => line.startsWith("/// @param") && line.includes("trans_mat"));

    assert.equal(
        paramLine,
        "/// @param [trans_mat]",
        "Expected synthesized docs to keep optional syntax when undefined defaults remain in the signature"
    );
});
