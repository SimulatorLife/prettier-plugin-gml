import assert from "node:assert/strict";
import test from "node:test";

import {
    getDefaultProjectIndexParser,
    formatProjectIndexSyntaxError
} from "../src/project-index/index.js";

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
                (error as any).message,
                /Syntax Error \(objects\/example\/Step_0\.gml: line 2, column \d+\): unexpected symbol ';/
            );
            assert.ok((error as any).message.includes("2 |     var value = ;"));
            assert.strictEqual(
                (error as any).filePath,
                "objects/example/Step_0.gml"
            );
            assert.strictEqual(
                (error as any).sourceExcerpt,
                "2 |     var value = ;\n  |                 ^"
            );
            assert.ok(
                (error as any).message.includes((error as any).sourceExcerpt)
            );
            assert.ok((error as any).originalMessage?.includes("Syntax Error"));
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

test("syntax error excerpts clamp oversized column values", () => {
    const error = {
        message: "Syntax Error: unexpected token",
        line: 1,
        column: 999
    };

    const formatted = formatProjectIndexSyntaxError(error, "var value = 1;");

    assert.strictEqual(
        formatted.sourceExcerpt,
        "1 | var value = 1;\n  |               ^"
    );
});

test("syntax error excerpts omit indicators for non-finite columns", () => {
    const error = {
        message: "Syntax Error: unexpected token",
        line: 1,
        column: Number.NaN
    };

    const formatted = formatProjectIndexSyntaxError(error, "var value = 1;");

    assert.strictEqual(formatted.sourceExcerpt, "1 | var value = 1;");
});

test("display path remains absolute when file matches the project root", () => {
    const error = {
        message: "Syntax Error: unexpected token",
        line: 1,
        column: 1
    };

    const projectRoot = "/project/root";
    const formatted = formatProjectIndexSyntaxError({ ...error }, "", {
        filePath: projectRoot,
        projectRoot
    });

    assert.strictEqual(formatted.filePath, projectRoot);
});

test("display path stays absolute when file lies outside the project root", () => {
    const error = {
        message: "Syntax Error: unexpected token",
        line: 1,
        column: 1
    };

    const formatted = formatProjectIndexSyntaxError({ ...error }, "", {
        filePath: "/external/project/file.gml",
        projectRoot: "/project/root"
    });

    assert.strictEqual(formatted.filePath, "/external/project/file.gml");
});

test("formatProjectIndexSyntaxError tolerates missing error objects", () => {
    const formatted = formatProjectIndexSyntaxError(null, "", {
        filePath: "objects/example/Step_0.gml",
        projectRoot: "/project/root"
    });

    assert.ok(formatted);
    assert.strictEqual(
        formatted.message,
        "Syntax Error (objects/example/Step_0.gml): "
    );
    assert.strictEqual(formatted.originalMessage, "");
});
