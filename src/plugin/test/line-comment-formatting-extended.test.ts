import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLineComment } from "../src/comments/line-comment-formatting.js";

void describe("line comment formatting extended", () => {
    void it("preserves 'Scenario 2' comment", () => {
        const comment = {
            type: "CommentLine",
            value: " Scenario 2",
            raw: "// Scenario 2"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// Scenario 2");
    });

    void it("strips boilerplate comments", () => {
        const comment = {
            type: "CommentLine",
            value: " Script assets have changed for v2.3.0",
            raw: "// Script assets have changed for v2.3.0"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, null);
    });

    void it("formats banner comments with 4+ slashes", () => {
        const comment = {
            type: "CommentLine",
            value: "// Banner",
            raw: "//// Banner"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "//// Banner");
    });

    void it("preserves commented out code", () => {
        const comment = {
            type: "CommentLine",
            value: " var x = 10;",
            raw: "// var x = 10;"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// var x = 10;");
    });

    void it("promotes @func to /// @function", () => {
        const comment = {
            type: "CommentLine",
            value: " @func my_func",
            raw: "// @func my_func"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "/// @function my_func");
    });

    void it("formats decorated banner comments", () => {
        const comment = {
            type: "CommentLine",
            value: " ---- Section ----",
            raw: "// ---- Section ----"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// Section");
    });

    void it("preserves inline triple slash doc as double slash", () => {
        const comment = {
            type: "CommentLine",
            value: "/ @param x",
            raw: "/// @param x",
            placement: "endOfLine"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// @param x");
    });

    void it("preserves plain triple slash numeric", () => {
        const comment = {
            type: "CommentLine",
            value: "/ 1. Step",
            raw: "/// 1. Step"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// 1. Step");
    });

    void it("strips custom boilerplate comments", () => {
        const comment = {
            type: "CommentLine",
            value: " Custom boilerplate",
            raw: "// Custom boilerplate"
        };
        const options = {
            boilerplateFragments: ["Custom boilerplate"],
            codeDetectionPatterns: []
        };
        const result = formatLineComment(comment, options);
        assert.strictEqual(result, null);
    });
});
