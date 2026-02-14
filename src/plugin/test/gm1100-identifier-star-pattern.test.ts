import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Parser } from "@gml-modules/parser";

import * as Transforms from "../src/transforms/index.js";

void describe("GM1100 identifier-star pattern preprocessing", () => {
    void it("sanitizes identifier * identifier pattern without var keyword", () => {
        const source = ["_this * something;", "", "    = 48;"].join("\n");

        const { sourceText, metadata } = Transforms.preprocessSourceForFeatherFixes(source);

        assert.notStrictEqual(
            sourceText,
            source,
            "Expected GM1100 preprocessor to modify the source text for identifier-star pattern."
        );
        assert.ok(metadata?.GM1100?.length > 0, "Expected GM1100 metadata to be recorded by the preprocessor.");

        const ast = Parser.GMLParser.parse(sourceText, {
            getLocations: true,
            simplifyLocations: false
        });

        assert.ok(ast, "Expected AST to be successfully parsed after preprocessing.");
        assert.strictEqual(ast.type, "Program", "Expected a Program node.");
    });

    void it("handles identifier-star pattern with doc comment", () => {
        const source = ["/// @description Test for GM1100", "", "_this * something;", "", "    = 48;"].join("\n");

        const { sourceText, metadata } = Transforms.preprocessSourceForFeatherFixes(source);

        assert.notStrictEqual(
            sourceText,
            source,
            "Expected GM1100 preprocessor to modify the source text while preserving doc comment."
        );
        assert.ok(metadata?.GM1100?.length > 0, "Expected GM1100 metadata to be recorded for identifier-star pattern.");

        const ast = Parser.GMLParser.parse(sourceText, {
            getLocations: true,
            simplifyLocations: false,
            getComments: true
        });

        assert.ok(ast, "Expected AST to be successfully parsed.");
        assert.ok(Array.isArray(ast.comments), "Expected comments to be preserved.");
    });

    void it("records correct metadata for identifier-star pattern", () => {
        const source = ["_this * something;", "", "    = 48;"].join("\n");

        const { metadata } = Transforms.preprocessSourceForFeatherFixes(source);

        assert.ok(metadata?.GM1100, "Expected GM1100 metadata to exist.");
        const gm1100Entries = metadata.GM1100;
        assert.ok(Array.isArray(gm1100Entries), "Expected GM1100 metadata to be an array.");
        assert.strictEqual(gm1100Entries.length, 2, "Expected two GM1100 entries (identifier-star and assignment).");

        const identifierStarEntry = gm1100Entries.find((entry) => entry.type === "identifier-star");
        assert.ok(identifierStarEntry, "Expected identifier-star metadata entry.");
        assert.strictEqual(identifierStarEntry.identifier, "_this", "Expected identifier to be '_this'.");

        const assignmentEntry = gm1100Entries.find((entry) => entry.type === "assignment");
        assert.ok(assignmentEntry, "Expected assignment metadata entry.");
        assert.strictEqual(assignmentEntry.identifier, "_this", "Expected assignment identifier to match.");
    });
});
