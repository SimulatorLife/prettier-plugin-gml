import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("formatter migrated-transform regression coverage", () => {
    void it("does not apply semantic/refactor transforms from migrated pipeline options", async () => {
        const source = [
            "#macro VALUE 1;",
            "var cfg = {};",
            "cfg.foo = 1;",
            "cfg.bar = 2;",
            'var label = "HP: " + string(hp);',
            "var ratio = total / 2;",
            "if ((ready && armed) || override) {",
            "    show_debug_message(label);",
            "}"
        ].join("\n");

        const formatted = await Plugin.format(source, {
            applyFeatherFixes: true,
            condenseStructAssignments: true,
            optimizeMathExpressions: true,
            optimizeLogicalExpressions: true,
            useStringInterpolation: true
        });

        assert.match(formatted, /#macro VALUE 1;/);
        assert.match(formatted, /cfg\.foo = 1;/);
        assert.match(formatted, /cfg\.bar = 2;/);
        assert.match(formatted, /"HP: " \+ string\(hp\)/);
        assert.match(formatted, /total \/ 2/);
        assert.doesNotMatch(formatted, /\$"HP:\s*\{hp\}"/);
        assert.doesNotMatch(formatted, /cfg\s*=\s*\{\s*foo:\s*1,\s*bar:\s*2\s*\}/);
    });

    void it("fails fast on invalid syntax instead of repairing parse input", async () => {
        const malformedSource = 'if (ready) {\n    show_debug_message("x");\n';

        await assert.rejects(async () => {
            await Plugin.format(malformedSource, {
                applyFeatherFixes: true,
                sanitizeMissingArgumentSeparators: true
            });
        });
    });

    void it("never mutates malformed comment text as a parser recovery strategy", async () => {
        const malformedCommentSource = "/ @description not-valid-comment\nvar value = 1;";

        await assert.rejects(async () => {
            await Plugin.format(malformedCommentSource);
        });

        assert.strictEqual(malformedCommentSource, "/ @description not-valid-comment\nvar value = 1;");
    });
});
