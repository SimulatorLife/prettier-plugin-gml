import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Parser } from "@gml-modules/parser";

function createLineComment(value, raw = `//${value}`) {
    return {
        type: "CommentLine",
        value,
        leadingText: raw,
        raw
    };
}

void describe("line comment boilerplate defaults", () => {
    void it("removes the YoYo asset banner without extra configuration", () => {
        const comment = createLineComment(
            " Script assets have changed for v2.3.0; visit https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information"
        );

        const formatted = Parser.formatLineComment(
            comment,
            Parser.DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(formatted, "");
    });

    void it("removes GameMaker's default script description stub", () => {
        const comment = createLineComment(
            " @description Insert description here",
            "/// @description Insert description here"
        );

        const formatted = Parser.formatLineComment(
            comment,
            Parser.DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(formatted, "");
    });

    void it("removes the default editor guidance stub", () => {
        const comment = createLineComment(
            " You can write your code in this editor",
            "// You can write your code in this editor"
        );

        const formatted = Parser.formatLineComment(
            comment,
            Parser.DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(formatted, "");
    });

    void it("preserves unrelated comments", () => {
        const comment = createLineComment(" Remember to sync the controller.");

        const formatted = Parser.formatLineComment(
            comment,
            Parser.DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(formatted, "// Remember to sync the controller.");
    });
});
