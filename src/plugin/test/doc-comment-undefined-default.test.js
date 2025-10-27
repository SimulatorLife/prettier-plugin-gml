import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

test("marks undefined default parameters as optional in doc comments", async () => {
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
        "/// @param [foo]",
        "Expected doc comments to retain optional syntax when omitting undefined defaults"
    );
});

test("omits optional syntax for synthesized docs with undefined defaults", async () => {
    const source = [
        "function choose_profile(settings, fallback = undefined) {",
        "    var config = settings ?? global.default_settings;",
        "    var themeCandidate = config.theme_override ?? fallback.theme_override;",
        "    var finalTheme = themeCandidate ?? global.theme_defaults;",
        "    if ((config ?? fallback) == undefined) {",
        "        return \"guest\";",
        "    }",
        "    return (config.profile ?? fallback.profile) ?? \"guest\";",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const lines = formatted.split("\n");
    const fallbackDocLine = lines.find((line) =>
        line.startsWith("/// @param") && line.includes("fallback")
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
