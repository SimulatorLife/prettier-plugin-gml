import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("Description Comment Support", () => {
    void it("should NOT remove non-empty @description at the top of the file followed by var", async () => {
        const source = `/// @description Initialize the sky background\nvar a = 1;`;
        const formatted = await Plugin.format(source);
        assert.match(formatted, /@description Initialize the sky background/);
    });

    void it("should NOT remove non-empty @description followed by expression", async () => {
        const source = `/// @description Initialize the sky background\na = 1;`;
        const formatted = await Plugin.format(source);
        assert.match(formatted, /@description Initialize the sky background/);
    });

    void it("should remove empty @description for variables", async () => {
        const source = `/// @description\nvar a = 1;`;
        const formatted = await Plugin.format(source);
        assert.doesNotMatch(formatted, /@description/);
    });

    void it("should remove empty @description with spaces for variables", async () => {
        const source = `/// @description    \nvar a = 1;`;
        const formatted = await Plugin.format(source);
        assert.doesNotMatch(formatted, /@description/);
    });

    void it("should remove empty @description for functions", async () => {
        const source = `/// @description\nfunction test() {}`;
        const formatted = await Plugin.format(source);
        assert.doesNotMatch(formatted, /@description/);
    });

    void it("should wrap long @description on variables", async () => {
        const source = `/// @description This is a very long description that should definitely be wrapped by the prettier plugin if the print width is set small enough.\nvar a = 1;`;
        const formatted = await Plugin.format(source, { printWidth: 40 });
        const lines = formatted.trim().split("\n");
        assert.ok(lines.length > 2, "Should have wrapped onto multiple lines");

        const docLines = lines.slice(0, -1);
        assert.ok(
            docLines.every((l) => l.trim().startsWith("///")),
            "Leading lines should be doc comments"
        );
    });
});
