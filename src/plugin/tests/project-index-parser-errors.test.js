import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultProjectIndexParser } from "../src/project-index/gml-parser-facade.js";

test("project index parser reports syntax errors with context", () => {
    const parser = getDefaultProjectIndexParser();
    const invalidSource = [
        "function example() {",
        "    var value = ;",
        "}",
        ""
    ].join("\n");

    assert.throws(
        () =>
            parser(invalidSource, {
                filePath: "objects/example/Step_0.gml",
                projectRoot: "/project/root"
            }),
        (error) => {
            assert.match(
                error.message,
                /Syntax Error \(objects\/example\/Step_0\.gml: line 2, column \d+\): unexpected symbol ';/
            );
            assert.ok(error.message.includes("2 |     var value = ;"));
            assert.strictEqual(error.filePath, "objects/example/Step_0.gml");
            assert.strictEqual(
                error.sourceExcerpt,
                "2 |     var value = ;\n  |                 ^"
            );
            assert.ok(error.message.includes(error.sourceExcerpt));
            assert.ok(error.originalMessage?.includes("Syntax Error"));
            return true;
        }
    );
});
