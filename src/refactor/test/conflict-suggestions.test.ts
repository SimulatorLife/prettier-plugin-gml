import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { detectRenameConflicts, validateCrossFileConsistency } from "../src/validation.js";
import { ConflictType, type SymbolResolver, type SymbolOccurrence, type FileSymbolProvider } from "../src/types.js";

void describe("conflict resolution suggestions", () => {
    void test("provides suggestions for invalid identifier conflicts", async () => {
        const occurrences: Array<SymbolOccurrence> = [];
        const conflicts = await detectRenameConflicts("oldName", "123invalid", occurrences, null, null);

        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].type, ConflictType.INVALID_IDENTIFIER);
        assert.ok(conflicts[0].suggestions);
        assert.ok(conflicts[0].suggestions.length > 0);
        assert.ok(conflicts[0].suggestions.some((s) => s.includes("letter") || s.includes("underscore")));
    });

    void test("provides suggestions for reserved keyword conflicts", async () => {
        const occurrences: Array<SymbolOccurrence> = [];
        const conflicts = await detectRenameConflicts("oldName", "if", occurrences, null, null);

        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].type, ConflictType.RESERVED);
        assert.ok(conflicts[0].suggestions);
        assert.ok(conflicts[0].suggestions.length > 0);
        assert.ok(
            conflicts[0].suggestions.some((s) => s.includes("if_value") || s.includes("myIf") || s.includes("prefix"))
        );
    });

    void test("provides suggestions for shadowing conflicts", async () => {
        const resolver: Partial<SymbolResolver> = {
            lookup: async (name: string) => {
                if (name === "existingSymbol") {
                    return { name: "existingSymbol" };
                }
                return null;
            }
        };

        const occurrences: Array<SymbolOccurrence> = [{ path: "test.gml", start: 0, end: 10, scopeId: "scope1" }];

        const conflicts = await detectRenameConflicts("oldName", "existingSymbol", occurrences, resolver, null);

        assert.ok(conflicts.length > 0);
        const shadowConflict = conflicts.find((c) => c.type === ConflictType.SHADOW);
        assert.ok(shadowConflict);
        assert.ok(shadowConflict.suggestions);
        assert.ok(shadowConflict.suggestions.length > 0);
        assert.ok(
            shadowConflict.suggestions.some(
                (s) => s.includes("different name") || s.includes("Rename") || s.includes("existingSymbol")
            )
        );
    });

    void test("deduplicates shadow conflict suggestions across same scope", async () => {
        const resolver: Partial<SymbolResolver> = {
            lookup: async (name: string) => {
                if (name === "existingSymbol") {
                    return { name: "existingSymbol" };
                }
                return null;
            }
        };

        const occurrences: Array<SymbolOccurrence> = [
            { path: "test.gml", start: 0, end: 10, scopeId: "scope1" },
            { path: "test.gml", start: 20, end: 30, scopeId: "scope1" },
            { path: "test.gml", start: 40, end: 50, scopeId: "scope1" }
        ];

        const conflicts = await detectRenameConflicts("oldName", "existingSymbol", occurrences, resolver, null);

        const shadowConflicts = conflicts.filter((c) => c.type === ConflictType.SHADOW);
        assert.strictEqual(shadowConflicts.length, 1, "Should only report one conflict per unique scope");
    });

    void test("provides suggestions for cross-file conflicts", async () => {
        const fileProvider: Partial<FileSymbolProvider> = {
            getFileSymbols: async (filePath: string) => {
                if (filePath === "test.gml") {
                    return [{ id: "gml/script/existingSymbol" }];
                }
                return [];
            }
        };

        const occurrences: Array<SymbolOccurrence> = [{ path: "test.gml", start: 0, end: 10 }];

        const errors = await validateCrossFileConsistency(
            "gml/script/oldSymbol",
            "existingSymbol",
            occurrences,
            fileProvider
        );

        assert.ok(errors.length > 0);
        const shadowError = errors.find((e) => e.type === ConflictType.SHADOW);
        assert.ok(shadowError);
        assert.ok(shadowError.suggestions);
        assert.ok(shadowError.suggestions.length > 0);
        assert.ok(
            shadowError.suggestions.some(
                (s) =>
                    s.includes("Rename the existing") || s.includes("different target") || s.includes("Review the file")
            )
        );
    });

    void test("provides suggestions for large rename warnings", async () => {
        const fileProvider: Partial<FileSymbolProvider> = {
            getFileSymbols: async () => []
        };

        const occurrences: Array<SymbolOccurrence> = [];
        for (let i = 0; i < 25; i++) {
            occurrences.push({ path: "test.gml", start: i * 10, end: i * 10 + 5 });
        }

        const errors = await validateCrossFileConsistency(
            "gml/script/oldSymbol",
            "newSymbol",
            occurrences,
            fileProvider
        );

        assert.ok(errors.length > 0);
        const largeRenameWarning = errors.find((e) => e.type === ConflictType.LARGE_RENAME);
        assert.ok(largeRenameWarning);
        assert.ok(largeRenameWarning.suggestions);
        assert.ok(largeRenameWarning.suggestions.length > 0);
        assert.ok(
            largeRenameWarning.suggestions.some(
                (s) => s.includes("Review") || s.includes("tests") || s.includes("version control")
            )
        );
    });

    void test("suggestions are contextual to the conflict type", async () => {
        const occurrences: Array<SymbolOccurrence> = [];

        const invalidConflicts = await detectRenameConflicts("old", "123bad", occurrences, null, null);
        const reservedConflicts = await detectRenameConflicts("old", "function", occurrences, null, null);

        assert.notDeepEqual(invalidConflicts[0].suggestions, reservedConflicts[0].suggestions);
    });

    void test("suggestions include specific alternative names for reserved keywords", async () => {
        const occurrences: Array<SymbolOccurrence> = [];
        const conflicts = await detectRenameConflicts("old", "return", occurrences, null, null);

        assert.strictEqual(conflicts.length, 1);
        assert.ok(conflicts[0].suggestions);
        assert.ok(
            conflicts[0].suggestions.some((s) => s.includes("return_value") || s.includes("myReturn")),
            "Should suggest specific alternatives"
        );
    });
});
