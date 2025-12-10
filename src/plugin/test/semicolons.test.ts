import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AstPath } from "prettier";

import * as Semicolons from "../src/printer/semicolons.js";

void describe("Semicolons helper utilities", () => {
    void it("flags statement nodes that require a terminator", () => {
        assert.strictEqual(
            Semicolons.optionalSemicolon("ExpressionStatement"),
            ";"
        );
        assert.strictEqual(Semicolons.optionalSemicolon("IfStatement"), "");
    });

    void it("counts trailing blank lines after a given index", () => {
        const text = "foo();\n\n\nbar();";
        const newlineIndex = text.indexOf("\n");
        assert.strictEqual(
            Semicolons.countTrailingBlankLines(text, newlineIndex),
            2
        );
        assert.strictEqual(Semicolons.countTrailingBlankLines(null, 0), 0);
    });

    void it("finds the next non-whitespace character", () => {
        const text = "  \n  }";
        assert.strictEqual(
            Semicolons.getNextNonWhitespaceCharacter(text, 0),
            "}"
        );
        assert.strictEqual(
            Semicolons.getNextNonWhitespaceCharacter(null, 0),
            null
        );
    });

    void it("recognizes whitespace characters the semicolon scanner skips", () => {
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(9), true);
        assert.strictEqual(
            Semicolons.isSkippableSemicolonWhitespace(0x20_28),
            true
        );
        assert.strictEqual(
            Semicolons.isSkippableSemicolonWhitespace(0x41),
            false
        );
    });

    void it("determines whether the path references the last statement", () => {
        const body = ["first", "second", "third"];
        const parent = { body };

        const pathForLast = {
            getParentNode: () => parent,
            getValue: () => body.at(-1)
        } as unknown as AstPath<unknown>;

        assert.strictEqual(Semicolons.isLastStatement(pathForLast), true);

        const pathForFirst = {
            getParentNode: () => parent,
            getValue: () => body[0]
        } as unknown as AstPath<unknown>;

        assert.strictEqual(Semicolons.isLastStatement(pathForFirst), false);

        const orphanPath = {
            getParentNode: () => null,
            getValue: () => ({})
        } as unknown as AstPath<unknown>;

        assert.strictEqual(Semicolons.isLastStatement(orphanPath), true);
    });
});
