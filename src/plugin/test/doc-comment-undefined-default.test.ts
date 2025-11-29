import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

const __dirname = import.meta.dirname;

test("treats undefined defaults as required when the signature omits the default", async () => {
    const source = [
        "/// @function sample",
        "/// @param foo",
        "function sample(foo = undefined) {",
        "    return foo;",
        "}",
        ""
    ].join("\n");

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

test("preserves optional annotations when parameters are explicitly documented as optional", async () => {
    const source = [
        "/// @function sample",
        "/// @param [foo]",
        "function sample(foo = undefined) {",
        "    return foo;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        applyFeatherFixes: true
    });

    const lines = formatted.split("\n");
    const paramLine = lines.find((line) => line.startsWith("/// @param"));
    assert.equal(
        paramLine,
        "/// @param [foo]",
        "Expected explicit optional annotations to be preserved"
    );
    assert.match(
        formatted,
        /function sample\(foo = undefined\)/,
        "Expected explicitly optional parameters to retain their undefined default"
    );
});

test("omits optional syntax for synthesized docs with undefined defaults", async () => {
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
    const fallbackDocLine = lines.find(
        (line) => line.startsWith("/// @param") && line.includes("fallback")
    );
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

test("retains optional syntax when constructors keep explicit undefined defaults", async () => {
    const source = [
        "/// @function Shape",
        "function Shape(color = undefined) constructor {",
        "    self.color = color;",
        "}",
        "",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
    });

    assert.ok(
        formatted.includes("/// @param [color]"),
        "Expected synthesized constructor docs to keep optional syntax when undefined defaults remain in the signature"
    );
});

test("synthesized docs mark retained undefined defaults as optional", async () => {
    async function resolveFixture(name: string) {
        const compiledCandidate = path.resolve(__dirname, name);
        try {
            // prefer compiled fixtures if present (dist/test). Otherwise, fall back to the
            // source test fixtures under src/plugin/test for local/source test runs.
            const stat = await fs.stat(compiledCandidate);
            if (stat && stat.isFile()) return compiledCandidate;
        } catch (e) {
            // compiled fixture not present; try to resolve the source fixture by swapping
            // a "dist" path component back to "src" — this handles running the compiled
            // tests in dist/ and falling back to the original sources at src/ during dev.
            // Replace the compiled test path (dist/test) back to the source test
            // path (src/plugin/test). The compiled tests live under
            // src/plugin/dist/test when running compiled artifacts, so moving up
            // two levels and into the test directory reliably locates the
            // source fixtures regardless of whether the test runner executes
            // the compiled or source files.
            const fallbackCandidate = path.resolve(
                __dirname,
                "..",
                "..",
                "test",
                name
            );
            try {
                const stat2 = await fs.stat(fallbackCandidate);
                if (stat2 && stat2.isFile()) return fallbackCandidate;
            } catch (e2) {
                // final fallback: resolve relative to src/plugin/test from whatever __dirname is
                const finalCandidate = path.resolve(
                    __dirname,
                    "..",
                    "test",
                    name
                );
                return finalCandidate;
            }
        }
        return compiledCandidate;
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

    const paramLine = formatted
        .split("\n")
        .find(
            (line) =>
                line.startsWith("/// @param") && line.includes("trans_mat")
        );

    assert.equal(
        paramLine,
        "/// @param [trans_mat]",
        "Expected synthesized docs to keep optional syntax when undefined defaults remain in the signature"
    );
});
