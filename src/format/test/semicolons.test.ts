import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AstPath } from "prettier";

import * as Semicolons from "../src/printer/semicolons.js";

void describe("Semicolons helper utilities", () => {
    void it("flags statement nodes that require a terminator", () => {
        assert.strictEqual(Semicolons.optionalSemicolon("ExpressionStatement"), ";");
        assert.strictEqual(Semicolons.optionalSemicolon("IfStatement"), "");
    });

    void it("counts trailing blank lines after a given index", () => {
        const text = "foo();\n\n\nbar();";
        const newlineIndex = text.indexOf("\n");
        assert.strictEqual(Semicolons.countTrailingBlankLines(text, newlineIndex), 2);
        assert.strictEqual(Semicolons.countTrailingBlankLines(null, 0), 0);
    });

    void it("finds the next non-whitespace character", () => {
        const text = "  \n  }";
        assert.strictEqual(Semicolons.getNextNonWhitespaceCharacter(text, 0), "}");
        assert.strictEqual(Semicolons.getNextNonWhitespaceCharacter(null, 0), null);
    });

    void it("recognizes whitespace characters the semicolon scanner skips", () => {
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(9), true);
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x20_28), true);
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x41), false);
    });

    void it("ASCII fast-path covers all six ASCII whitespace code points and excludes non-whitespace", () => {
        // All six ASCII whitespace characters must be recognized without
        // allocating a string (the fast path handles charCode < 128).
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x09), true, "HT (tab)");
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x0a), true, "LF");
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x0b), true, "VT");
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x0c), true, "FF");
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x0d), true, "CR");
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x20), true, "SP (space)");

        // Non-whitespace ASCII characters must not be classified as whitespace.
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x08), false, "BS (not whitespace)");
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x21), false, "! (not whitespace)");
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x7f), false, "DEL (not whitespace)");

        // ASCII boundary: 0x7f is the last ASCII char and must not leak through.
        assert.strictEqual(Semicolons.isSkippableSemicolonWhitespace(0x7f), false, "boundary 0x7f");
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

    void it("handles Unicode whitespace characters beyond the basic ASCII set", () => {
        // This test proves the generalization: Unicode whitespace (like em-space U+2003)
        // should be recognized as whitespace when skipping to find the next meaningful token.
        // The original implementation only handled 6 hardcoded ASCII values.

        // U+2003 em-space is a valid Unicode whitespace character that matches /\s/
        const textWithEmSpace = "\u2003\u2003}";
        assert.strictEqual(
            Semicolons.getNextNonWhitespaceCharacter(textWithEmSpace, 0),
            "}",
            "Should skip Unicode em-space (U+2003) whitespace"
        );

        // U+2009 thin-space is another Unicode whitespace
        const textWithThinSpace = "\u2009\u2009bar";
        assert.strictEqual(
            Semicolons.getNextNonWhitespaceCharacter(textWithThinSpace, 0),
            "b",
            "Should skip Unicode thin-space (U+2009) whitespace"
        );

        // U+1680 Ogham space mark
        const textWithOghamSpace = "\u1680{";
        assert.strictEqual(
            Semicolons.getNextNonWhitespaceCharacter(textWithOghamSpace, 0),
            "{",
            "Should skip Unicode Ogham space (U+1680) whitespace"
        );
    });

    void it("handles Unicode whitespace in blank line counting", () => {
        // Prove that Unicode whitespace between newlines should be recognized
        // when counting blank lines, just like ASCII whitespace.

        // Text with Unicode em-space between newlines
        const textWithUnicodeSpaces = "foo();\n\u2003\n\u2003\nbar();";
        const newlineIndex = textWithUnicodeSpaces.indexOf("\n");

        // Should count 2 blank lines (same as with ASCII spaces)
        assert.strictEqual(
            Semicolons.countTrailingBlankLines(textWithUnicodeSpaces, newlineIndex),
            2,
            "Should count blank lines correctly with Unicode whitespace"
        );
    });
});
