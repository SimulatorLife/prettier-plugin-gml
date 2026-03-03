import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Format } from "../src/index.js";

void describe("switch comment formatting", () => {
    void it("keeps break statements indented after block comments in switch cases", async () => {
        const input = [
            "switch (x) {",
            "    case 1:",
            "        /*specularity = clamp(real(terms[1]), 1, 1000);*/",
            "        break;",
            "    default:",
            "        break;",
            "}",
            ""
        ].join("\n");

        const formatted = await Format.format(input, { parser: "gml" });

        assert.match(
            formatted,
            /\n\s{8}break;\n\s{4}default:/,
            "Expected break to stay indented inside the case body after a block comment."
        );
    });

    void it("preserves commented-out code inside multi-line block comments", async () => {
        const input = [
            "switch (x) {",
            "    case 1:",
            "        /*var term = 1;",
            '        if terms[1] == "spectral" { break; }',
            '        if terms[1] == "xyz" { term++; }',
            "        specularity = clamp(real(terms[term]), 0, 1);*/",
            "        break;",
            "}",
            ""
        ].join("\n");

        const formatted = await Format.format(input, { parser: "gml" });

        assert.ok(
            !formatted.includes(" * var term = 1;"),
            "Expected commented-out code block comments to remain unchanged instead of being reflowed with '*' prefixes."
        );

        assert.match(formatted, /\/\*var term = 1;[\s\S]*specularity = clamp\(real\(terms\[term\]\), 0, 1\);\*\//);
    });
});
