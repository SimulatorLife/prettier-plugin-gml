import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

test("treats undefined defaults as required when the signature omits the default", async () => {
    const source = [
        "/// @function sample",
        "/// @param foo",
        "function sample(foo = undefined) {",
        "    return foo;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
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

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
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

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
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

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.ok(
        formatted.includes("/// @param [color]"),
        "Expected synthesized constructor docs to keep optional syntax when undefined defaults remain in the signature"
    );
});

test("synthesized docs mark retained undefined defaults as optional", async () => {
    const fixturePath = path.resolve(__dirname, "testFunctions.input.gml");
    const optionsPath = path.resolve(__dirname, "testFunctions.options.json");
    const [source, rawOptions] = await Promise.all([
        fs.readFile(fixturePath, "utf8"),
        fs.readFile(optionsPath, "utf8")
    ]);

    const options = JSON.parse(rawOptions);
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
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
