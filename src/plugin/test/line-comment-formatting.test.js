import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, it } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const formatPath = path.resolve(
    currentDirectory,
    "../src/comments/line-comment-formatting.js"
);

const { formatLineComment } = await import(formatPath);

describe("line comment formatting helpers", () => {
    it("promotes leading doc-like single-slash comments to triple-slash", () => {
        const docLikeComment = {
            type: "CommentLine",
            value: " Leading summary",
            leadingText: "// / Leading summary"
        };

        const result = formatLineComment(docLikeComment, {});
        assert.strictEqual(result.trim(), "/// Leading summary");
    });

    it("formats a long inline comment with preserved spacing", () => {
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

        const result = formatLineComment(testComment, {});

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
});
