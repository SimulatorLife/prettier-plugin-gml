import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source) {
    return prettier.format(source, {
        plugins: [pluginPath],
        parser: "gml-parse"
    });
}

const DRAW_CALL_SOURCE = `global.lighting.draw(\n    vmat, pmat,\n    function() {\n        renderDepth();\n    },\n    function() {\n        renderColour();\n    }\n);`;

const DRAW_CALL_EXPECTED = `global.lighting.draw(\n    vmat, pmat,\n    function() {\n        renderDepth();\n    },\n    function() {\n        renderColour();\n    }\n);`;

const CALL_LATER_SOURCE = `call_later(\n    1800,\n    time_source_units_frames,\n    function callback() {\n        tick();\n    },\n    true\n);`;

const CALL_LATER_EXPECTED = `call_later(\n    1800,\n    time_source_units_frames,\n    function callback() {\n        tick();\n    },\n    true\n);`;

describe("member call layout", () => {
    it("keeps chained call callee segments on the same line when arguments wrap", async () => {
        const formatted = await format(DRAW_CALL_SOURCE);
        assert.strictEqual(formatted.trim(), DRAW_CALL_EXPECTED);
    });

    it("preserves vertical argument layout when trailing callbacks are followed by simple values", async () => {
        const formatted = await format(CALL_LATER_SOURCE);
        assert.strictEqual(formatted.trim(), CALL_LATER_EXPECTED);
    });
});
