import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { describe, it } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, overrides) {
    const formatted = await prettier.format(source, {
        plugins: [pluginPath],
        parser: "gml-parse",
        ...overrides
    });

    if (typeof formatted !== "string") {
        throw new TypeError(
            "Prettier returned a non-string result when formatting GML."
        );
    }

    return formatted.trim();
}

describe("Feather fix regressions", () => {
    it("resets draw_set_halign calls without leaving blank separators", async () => {
        const source = [
            "draw_set_halign(fa_right);",
            "",
            'draw_text(room_width - 5, 5, "In the top-right corner");'
        ].join("\n");

        const formatted = await format(source, { applyFeatherFixes: true });

        assert.strictEqual(
            formatted,
            [
                "draw_set_halign(fa_right);",
                'draw_text(room_width - 5, 5, "In the top-right corner");',
                "draw_set_halign(fa_left);"
            ].join("\n")
        );
    });

    it("removes standalone vertex_end calls without preceding vertex_begin", async () => {
        const source = [
            "/// @description GM2009 - A standalone 'vertex_end' is invalid, so we'll remove it here",
            "vertex_end(vb);"
        ].join("\n");

        const formatted = await format(source, { applyFeatherFixes: true });

        assert.strictEqual(
            formatted,
            "/// @description GM2009 - A standalone 'vertex_end' is invalid, so we'll remove it here"
        );
    });
});
