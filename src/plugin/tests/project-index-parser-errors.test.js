import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultProjectIndexParser } from "../src/project-index/gml-parser-facade.js";
import { formatProjectIndexSyntaxError } from "../src/project-index/syntax-error-formatter.js";

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

test("syntax error excerpts expand tabs before pointing at the column", () => {
    const error = {
        message: "Syntax Error: unexpected token",
        line: 1,
        column: 2
    };

    const sourceText = "\tvar value = 1;";

    const formatted = formatProjectIndexSyntaxError(error, sourceText);

    assert.strictEqual(
        formatted.sourceExcerpt,
        "1 |     var value = 1;\n  |      ^"
    );
});

test("display path remains absolute when file matches the project root", () => {
    const error = {
        message: "Syntax Error: unexpected token",
        line: 1,
        column: 1
    };

    const projectRoot = "/project/root";
    const formatted = formatProjectIndexSyntaxError(
        { ...error },
        "",
        {
            filePath: projectRoot,
            projectRoot
        }
    );

    assert.strictEqual(formatted.filePath, projectRoot);
});

test("display path stays absolute when file lies outside the project root", () => {
    const error = {
        message: "Syntax Error: unexpected token",
        line: 1,
        column: 1
    };

    const formatted = formatProjectIndexSyntaxError(
        { ...error },
        "",
        {
            filePath: "/external/project/file.gml",
            projectRoot: "/project/root"
        }
    );

    assert.strictEqual(formatted.filePath, "/external/project/file.gml");
});
