import { formatLineComment } from "./src/plugin/src/comments/line-comment-formatting.js";

// Test the problematic case from the failing test
const testComment = {
    type: "CommentLine",
    value: " // foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);",
    leadingText:
        "// / foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);"
};

console.log("Testing comment:", testComment.leadingText);

const result = formatLineComment(testComment, {});
console.log("Result:", result);
console.log(
    "Expected:",
    "//     // foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);"
);

// Let's also test the exact doc-like pattern
const docLikeComment = {
    type: "CommentLine",
    value: " Leading summary",
    leadingText: "// / Leading summary"
};

console.log("\nTesting doc-like comment:", docLikeComment.leadingText);
const docResult = formatLineComment(docLikeComment, {});
console.log("Result:", docResult);
console.log("Expected: /// Leading summary");
