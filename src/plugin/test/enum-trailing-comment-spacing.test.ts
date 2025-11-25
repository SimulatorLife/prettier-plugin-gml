import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import prettier from "prettier";
import { existsSync } from "node:fs";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = (() => {
    const candidates = [
        path.resolve(currentDirectory, "../dist/src/index.js"),
        path.resolve(currentDirectory, "../dist/index.js"),
        path.resolve(currentDirectory, "../src/index.ts"),
        path.resolve(currentDirectory, "../src/plugin-entry.ts"),
        path.resolve(currentDirectory, "../src/index.js"),
        path.resolve(currentDirectory, "../src/gml.js")
    ];
    return candidates.find((p) => existsSync(p)) || candidates[0];
})();

async function formatWithPlugin(source, overrides = {}) {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...overrides
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return formatted;
}

describe("enum trailing comment spacing", () => {
    it("keeps inline comments snug after aligned initializers", async () => {
        const source = [
            "enum eTransitionType {",
            "    in = eTransitionState.in, // zoom in",
            "    out = eTransitionState.out, // zoom out",
            "    partway_in = eTransitionState.partway_in, // zoom part way in",
            "    partway_out = eTransitionState.partway_out // zoom part way in",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "enum eTransitionType {",
            "    in          = eTransitionState.in, // zoom in",
            "    out         = eTransitionState.out, // zoom out",
            "    partway_in  = eTransitionState.partway_in, // zoom part way in",
            "    partway_out = eTransitionState.partway_out // zoom part way in",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
