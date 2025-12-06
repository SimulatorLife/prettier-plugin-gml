import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    formatLineComment,
    normalizeBannerCommentText
} from "../src/comments/line-comment-formatting.js";

void describe("line comment formatting helpers", () => {
    void it("format triple slash-with-space comment into standard comment", () => {
        const docLikeComment = {
            type: "CommentLine",
            value: " Leading summary",
            raw: "// / Leading summary"
        };

        const result = formatLineComment(docLikeComment);
        assert.strictEqual(result.trim(), "// Leading summary");
    });

    void it("formats a long inline comment with preserved spacing", () => {
        // Scenario:
        // The codebase contains blocks of commented-out code where a comment
        // line itself contains a commented-out statement. In the wild this
        // looks like a nested comment inside an outer comment block:
        //
        // // try { // TODO ...
        // //     // foot_spd = min(...);
        // // } catch(ex) {
        // //     show_debug_message(...);
        // // }
        //
        // The formatter needs to preserve the intent (a double-commented
        // line) and the visual indentation that indicates it's commented-out
        // *inside* another comment block. This test constructs the AST-like
        // comment object that represents the inner commented-out line and
        // asserts the expected formatted representation.

        const testComment = {
            type: "CommentLine",
            value: " // foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);",
            leadingText:
                "// / foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);"
        };

        const result = formatLineComment(testComment);

        // Expected formatting (visualized): the outer comment prefix remains
        // `// ` and the inner, commented-out code remains `// ...` but with
        // additional padding so it lines up clearly as nested commented code.
        // This expectation mirrors the golden fixture used in the repo:
        //
        // // try { // TODO this sometimes throws NaN error, try catch is band-aid
        // //     // foot_spd = min(...);
        // // } catch(ex) {
        // //     show_debug_message(...);
        // // }
        //
        const expected =
            "//     // foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);";

        assert.strictEqual(result.trim(), expected);
    });

    void it("retains banner content when decorations were stripped upstream", () => {
        const normalized = normalizeBannerCommentText("Heading", {
            assumeDecorated: true
        });

        assert.strictEqual(normalized, "Heading");
    });

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

    void it("formats 'banner' comments with 4+ slashes into standard comments", () => {
        const comment = {
            type: "CommentLine",
            value: "// Banner",
            raw: "//// Banner"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// Banner");
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

    void it("preserves inline triple slash doc", () => {
        const comment = {
            type: "CommentLine",
            value: "/ @param x",
            raw: "/// @param x",
            placement: "endOfLine"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "/// @param x");
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

    void it("splits multi-sentence comments into multiple lines", () => {
        const comment = {
            type: "CommentLine",
            value: " First sentence. Second sentence.",
            raw: "// First sentence. Second sentence."
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// First sentence.\n// Second sentence.");
    });

    void it("splits merged comments separated by //", () => {
        const comment = {
            type: "CommentLine",
            value: " Comment 1 // Comment 2",
            raw: "// Comment 1 // Comment 2"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// Comment 1\n// Comment 2");
    });

    void it("promotes high-slash banner with @tag to triple-slash", () => {
        const comment = {
            type: "CommentLine",
            value: " @desc Description",
            raw: "//// @desc Description"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "/// @description Description");
    });

    void it("formats doc tag line with parenthesis style", () => {
        const comment = {
            type: "CommentLine",
            value: "()@param x",
            raw: "//()@param x"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "/// @param x");
    });

    void it("expands tabs to spaces in comments", () => {
        const comment = {
            type: "CommentLine",
            value: " val\tue",
            raw: "// val\tue"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "// val    ue");
    });

    void it("removes banner comments with excessive slashes and no content", () => {
        const comment = {
            type: "CommentLine",
            value: "///////",
            raw: "/////////"
        };
        const result = formatLineComment(comment);
        assert.strictEqual(result, "");
    });

    void it("debug: normalizeBannerCommentText works", () => {
        const result = normalizeBannerCommentText("---- Section ----");
        assert.strictEqual(result, "Section");
    });
});
