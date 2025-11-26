import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

test("struct literals stay multi-line when objectWrap preserves the leading break", async () => {
    const source = [
        "var enemy = {",
        '    name: "Slime",',
        "    hp: 5",
        "};"
    ].join("\n");

    const formatted = await Plugin.format(source, { objectWrap: "preserve" });

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

    const formatted = await Plugin.format(source, { objectWrap: "collapse" });

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

    const formatted = await Plugin.format(source, {
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
