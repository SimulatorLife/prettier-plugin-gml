import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("struct literals stay multi-line when objectWrap preserves the leading break", async () => {
    const source = [
        "var enemy = {",
        '    name: "Slime",',
        "    hp: 5",
        "};"
    ].join("\n");

    const formatted = await format(source, { objectWrap: "preserve" });

    assert.strictEqual(
        formatted,
        ["var enemy = {", '    name: "Slime",', "    hp: 5", "};", ""].join(
            "\n"
        )
    );
});

test("struct literals collapse to a single line when objectWrap is set to collapse", async () => {
    const source = [
        "var enemy = {",
        '    name: "Slime",',
        "    hp: 5",
        "};"
    ].join("\n");

    const formatted = await format(source, { objectWrap: "collapse" });

    assert.strictEqual(
        formatted,
        ['var enemy = {name: "Slime", hp: 5};', ""].join("\n")
    );
});

test("collapsed structs still wrap when the literal exceeds the print width", async () => {
    const source = [
        "var config = {",
        '    title: "a very very very long title that exceeds the configured print width",',
        "    enabled: true",
        "};"
    ].join("\n");

    const formatted = await format(source, {
        objectWrap: "collapse",
        printWidth: 60
    });

    assert.strictEqual(
        formatted,
        [
            "var config = {",
            '    title: "a very very very long title that exceeds the configured print width",',
            "    enabled: true",
            "};",
            ""
        ].join("\n")
    );
});
