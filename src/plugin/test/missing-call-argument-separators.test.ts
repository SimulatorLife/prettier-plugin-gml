import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test(
    "inserts synthetic separators for numeric call arguments that rely on whitespace",
    async () => {
        const source = "sum(1 2 3);\n";
        const formatted = await Plugin.format(source);

        assert.strictEqual(
            formatted,
            "sum(1, 2, 3);\n",
            "Numeric call arguments missing commas should receive synthesized separators."
        );
    }
);

void test(
    "preserves multiline whitespace when synthesizing numeric call separators",
    async () => {
        const source = [
            "call(",
            "    10",
            "    20",
            ");",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

        assert.strictEqual(
            formatted,
            [
                "call(",
                "    10,",
                "    20",
                ");",
                ""
            ].join("\n"),
            "Synthesized separators should respect the user's multiline layout."
        );
    }
);
