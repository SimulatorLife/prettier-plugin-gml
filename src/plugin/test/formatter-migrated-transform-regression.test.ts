import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("formatter migrated-transform regression coverage", () => {
    void it("does not apply semantic/content rewrites during formatting", async () => {
        const source = [
            "#macro VALUE 1;",
            "var cfg = {};",
            "cfg.foo = 1;",
            "cfg.bar = 2;",
            'var label = "HP: " + string(hp);',
            "var ratio = total / 2;",
            "globalvar score;",
            "score = 1;",
            "var item = lst_items[? 0];",
            "if ((ready && armed) || override) {",
            "    show_debug_message(label);",
            "}"
        ].join("\n");

        const formatted = await Plugin.format(source);

        assert.match(formatted, /#macro VALUE 1;/);
        assert.match(formatted, /cfg\.foo = 1;/);
        assert.match(formatted, /cfg\.bar = 2;/);
        assert.match(formatted, /"HP: " \+ string\(hp\)/);
        assert.match(formatted, /total \/ 2/);
        assert.match(formatted, /globalvar score;/);
        assert.match(formatted, /score = 1;/);
        assert.match(formatted, /lst_items\[\?\s*0]/);
        assert.doesNotMatch(formatted, /\$"HP:\s*\{hp\}"/);
        assert.doesNotMatch(formatted, /cfg\s*=\s*\{\s*foo:\s*1,\s*bar:\s*2\s*\}/);
        assert.doesNotMatch(formatted, /global\.score =/);
        assert.doesNotMatch(formatted, /lst_items\[\|\s*0]/);
    });

    void it("does not synthesize trailing optional defaults during formatting", async () => {
        const source = ["function demo(first, second = 1, third) {", "    return [first, second, third];", "}"].join(
            "\n"
        );
        const formatted = await Plugin.format(source);
        assert.match(formatted, /function demo\(first,\s*second = 1,\s*third\)/);
        assert.doesNotMatch(formatted, /third = undefined/);
    });

    void it("does not synthesize doc-comment tags during formatting", async () => {
        const source = [
            "function make_struct(value) {",
            "var result = {alpha:1,beta:value,gamma:call()};",
            "return result;",
            "}"
        ].join("\n");
        const formatted = await Plugin.format(source);
        assert.doesNotMatch(formatted, /^\/\/\/ @/m);
        assert.match(formatted, /function make_struct\(value\)/);
    });

    void it("fails fast on invalid syntax instead of repairing parse input", async () => {
        const malformedSource = 'if (ready) {\n    show_debug_message("x");\n';

        await assert.rejects(async () => {
            await Plugin.format(malformedSource);
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
