import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateRenameStructure, batchValidateScopeConflicts } from "../src/validation.js";
import type { SymbolResolver, SymbolOccurrence } from "../src/types.js";

void describe("validateRenameStructure", () => {
    void test("returns error for missing symbolId", async () => {
        const errors = await validateRenameStructure(null, "newName", null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("symbolId"));
    });

    void test("returns error for undefined symbolId", async () => {
        const errors = await validateRenameStructure(undefined, "newName", null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("symbolId"));
    });

    void test("returns error for empty symbolId", async () => {
        const errors = await validateRenameStructure("", "newName", null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("symbolId"));
    });

    void test("returns error for non-string symbolId", async () => {
        const errors = await validateRenameStructure(123 as unknown as string, "newName", null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("symbolId"));
    });

    void test("returns error for missing newName", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", null, null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("newName"));
    });

    void test("returns error for undefined newName", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", undefined, null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("newName"));
    });

    void test("returns error for empty newName", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", "", null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("newName"));
    });

    void test("returns error for non-string newName", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", 456 as unknown as string, null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("newName"));
    });

    void test("returns error for invalid identifier name", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", "123invalid", null);
        assert.ok(errors.length > 0);
        assert.ok(errors.some((e) => e.includes("Invalid") || e.includes("identifier") || e.includes("valid")));
    });

    void test("allows reserved keywords (semantic check happens later)", async () => {
        // validateRenameStructure only checks syntax, not semantics
        // Reserved keyword checking is done by detectRenameConflicts
        const errors = await validateRenameStructure("gml/script/scr_test", "if", null);
        assert.deepEqual(errors, []);
    });

    void test("returns error when new name matches old name", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", "scr_test", null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("matches"));
    });

    void test("returns error when symbol not found", async () => {
        const resolver: Partial<SymbolResolver> = {
            hasSymbol: async () => false
        };

        const errors = await validateRenameStructure("gml/script/scr_missing", "scr_new", resolver);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("not found"));
    });

    void test("returns empty array for valid rename without resolver", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", "scr_new", null);
        assert.deepEqual(errors, []);
    });

    void test("returns empty array for valid rename with resolver that finds symbol", async () => {
        const resolver: Partial<SymbolResolver> = {
            hasSymbol: async () => true
        };

        const errors = await validateRenameStructure("gml/script/scr_test", "scr_new", resolver);
        assert.deepEqual(errors, []);
    });

    void test("skips existence check when resolver lacks hasSymbol", async () => {
        const resolver: Partial<SymbolResolver> = {
            lookup: async (name: string) => ({ name })
        };

        const errors = await validateRenameStructure("gml/script/scr_test", "scr_new", resolver);
        assert.deepEqual(errors, []);
    });

    void test("validates identifier syntax before checking existence", async () => {
        const resolver: Partial<SymbolResolver> = {
            hasSymbol: async () => {
                throw new Error("Should not be called for invalid identifier");
            }
        };

        const errors = await validateRenameStructure("gml/script/scr_test", "123invalid", resolver);
        assert.ok(errors.length > 0);
        assert.ok(errors.some((e) => e.includes("Invalid") || e.includes("identifier")));
    });

    void test("handles complex symbol IDs correctly", async () => {
        const resolver: Partial<SymbolResolver> = {
            hasSymbol: async () => true
        };

        const errors = await validateRenameStructure("gml/var/obj_player::hp", "max_hp", resolver);
        assert.deepEqual(errors, []);
    });

    void test("extracts name correctly from symbolId", async () => {
        const errors = await validateRenameStructure("gml/script/path/to/scr_nested", "scr_nested", null);
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes("matches"));
    });

    void test("handles whitespace-only names", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", "   ", null);
        assert.ok(errors.length > 0);
        assert.ok(errors.some((e) => e.includes("whitespace") || e.includes("empty")));
    });

    void test("accepts valid GML identifiers", async () => {
        const testCases = ["validName", "Valid_Name_123", "_privateVar", "CamelCase", "snake_case"];

        for (const name of testCases) {
            // eslint-disable-next-line no-await-in-loop -- Testing multiple cases sequentially
            const errors = await validateRenameStructure("gml/script/scr_test", name, null);
            assert.deepEqual(errors, [], `Expected no errors for valid identifier: ${name}`);
        }
    });

    void test("rejects identifiers starting with numbers", async () => {
        const errors = await validateRenameStructure("gml/script/scr_test", "123test", null);
        assert.ok(errors.length > 0);
    });

    void test("rejects identifiers with special characters", async () => {
        const testCases = ["test-name", "test.name", "test@name", "test#name"];

        for (const name of testCases) {
            // eslint-disable-next-line no-await-in-loop -- Testing multiple cases sequentially
            const errors = await validateRenameStructure("gml/script/scr_test", name, null);
            assert.ok(errors.length > 0, `Expected errors for invalid identifier: ${name}`);
        }
    });

    void test("returns early on structural errors without calling resolver", async () => {
        let resolverCalled = false;
        const resolver: Partial<SymbolResolver> = {
            hasSymbol: async () => {
                resolverCalled = true;
                return true;
            }
        };

        await validateRenameStructure(null, "newName", resolver);
        assert.equal(resolverCalled, false, "Resolver should not be called when symbolId is invalid");
    });

    void test("supports async resolver", async () => {
        const resolver: Partial<SymbolResolver> = {
            hasSymbol: async (symbolId: string) => {
                await new Promise((resolve) => setTimeout(resolve, 1));
                return symbolId === "gml/script/scr_exists";
            }
        };

        const errors1 = await validateRenameStructure("gml/script/scr_exists", "scr_new", resolver);
        assert.deepEqual(errors1, []);

        const errors2 = await validateRenameStructure("gml/script/scr_missing", "scr_new", resolver);
        assert.ok(errors2.length > 0);
        assert.ok(errors2[0].includes("not found"));
    });
});

void describe("batchValidateScopeConflicts", () => {
    void test("returns empty map when no resolver provided", async () => {
        const occurrences: Array<SymbolOccurrence> = [{ path: "test.gml", start: 0, end: 10, scopeId: "scope1" }];

        const conflicts = await batchValidateScopeConflicts(occurrences, "newName", null);
        assert.equal(conflicts.size, 0);
    });

    void test("returns empty map when resolver lacks lookup function", async () => {
        const occurrences: Array<SymbolOccurrence> = [{ path: "test.gml", start: 0, end: 10, scopeId: "scope1" }];

        const resolver: Partial<SymbolResolver> = {
            hasSymbol: async () => true
        };

        const conflicts = await batchValidateScopeConflicts(occurrences, "newName", resolver);
        assert.equal(conflicts.size, 0);
    });

    void test("returns empty map for empty occurrences array", async () => {
        const resolver: Partial<SymbolResolver> = {
            lookup: async () => null
        };

        const conflicts = await batchValidateScopeConflicts([], "newName", resolver);
        assert.equal(conflicts.size, 0);
    });

    void test("returns empty map when new name is invalid identifier", async () => {
        const occurrences: Array<SymbolOccurrence> = [{ path: "test.gml", start: 0, end: 10, scopeId: "scope1" }];

        const resolver: Partial<SymbolResolver> = {
            lookup: async () => ({ name: "existing" })
        };

        const conflicts = await batchValidateScopeConflicts(occurrences, "123invalid", resolver);
        assert.equal(conflicts.size, 0);
    });

    void test("detects conflict when name exists in scope", async () => {
        const occurrences: Array<SymbolOccurrence> = [{ path: "test.gml", start: 0, end: 10, scopeId: "scope1" }];

        const resolver: Partial<SymbolResolver> = {
            lookup: async (name: string, scopeId?: string) => {
                if (name === "existingName" && scopeId === "scope1") {
                    return { name: "existingName" };
                }
                return null;
            }
        };

        const conflicts = await batchValidateScopeConflicts(occurrences, "existingName", resolver);
        assert.equal(conflicts.size, 1);
        assert.ok(conflicts.has("scope1"));

        const conflict = conflicts.get("scope1");
        assert.ok(conflict);
        assert.ok(conflict.message.includes("existingName"));
        assert.equal(conflict.existingSymbol, "existingName");
    });

    void test("groups occurrences by scope and validates once per scope", async () => {
        const occurrences: Array<SymbolOccurrence> = [
            { path: "test1.gml", start: 0, end: 10, scopeId: "scope1" },
            { path: "test1.gml", start: 20, end: 30, scopeId: "scope1" },
            { path: "test2.gml", start: 0, end: 10, scopeId: "scope2" }
        ];

        let lookupCount = 0;
        const resolver: Partial<SymbolResolver> = {
            lookup: async () => {
                lookupCount++;
                return null;
            }
        };

        await batchValidateScopeConflicts(occurrences, "newName", resolver);
        assert.equal(lookupCount, 2, "Should only lookup once per unique scope");
    });

    void test("handles global scope (undefined scopeId)", async () => {
        const occurrences: Array<SymbolOccurrence> = [{ path: "test.gml", start: 0, end: 10 }];

        let calledWithUndefined = false;
        const resolver: Partial<SymbolResolver> = {
            lookup: async (name: string, scopeId?: string) => {
                if (scopeId === undefined) {
                    calledWithUndefined = true;
                }
                return null;
            }
        };

        await batchValidateScopeConflicts(occurrences, "newName", resolver);
        assert.ok(calledWithUndefined, "Should call lookup with undefined for global scope");
    });

    void test("detects conflicts in multiple scopes", async () => {
        const occurrences: Array<SymbolOccurrence> = [
            { path: "test1.gml", start: 0, end: 10, scopeId: "scope1" },
            { path: "test2.gml", start: 0, end: 10, scopeId: "scope2" }
        ];

        const resolver: Partial<SymbolResolver> = {
            lookup: async (name: string, scopeId?: string) => {
                if (name === "conflictName" && (scopeId === "scope1" || scopeId === "scope2")) {
                    return { name: "conflictName" };
                }
                return null;
            }
        };

        const conflicts = await batchValidateScopeConflicts(occurrences, "conflictName", resolver);
        assert.equal(conflicts.size, 2);
        assert.ok(conflicts.has("scope1"));
        assert.ok(conflicts.has("scope2"));
    });

    void test("returns no conflicts when name is safe in all scopes", async () => {
        const occurrences: Array<SymbolOccurrence> = [
            { path: "test1.gml", start: 0, end: 10, scopeId: "scope1" },
            { path: "test2.gml", start: 0, end: 10, scopeId: "scope2" },
            { path: "test3.gml", start: 0, end: 10, scopeId: "scope3" }
        ];

        const resolver: Partial<SymbolResolver> = {
            lookup: async () => null
        };

        const conflicts = await batchValidateScopeConflicts(occurrences, "safeName", resolver);
        assert.equal(conflicts.size, 0);
    });

    void test("normalizes identifier name before checking", async () => {
        const occurrences: Array<SymbolOccurrence> = [{ path: "test.gml", start: 0, end: 10, scopeId: "scope1" }];

        let checkedName: string | undefined;
        const resolver: Partial<SymbolResolver> = {
            lookup: async (name: string) => {
                checkedName = name;
                return null;
            }
        };

        await batchValidateScopeConflicts(occurrences, "validName", resolver);
        assert.equal(checkedName, "validName");
    });

    void test("handles mixed scoped and unscoped occurrences", async () => {
        const occurrences: Array<SymbolOccurrence> = [
            { path: "test1.gml", start: 0, end: 10, scopeId: "scope1" },
            { path: "test2.gml", start: 0, end: 10 },
            { path: "test3.gml", start: 0, end: 10, scopeId: "scope2" }
        ];

        const scopesChecked: Array<string | undefined> = [];
        const resolver: Partial<SymbolResolver> = {
            lookup: async (name: string, scopeId?: string) => {
                scopesChecked.push(scopeId);
                return null;
            }
        };

        await batchValidateScopeConflicts(occurrences, "newName", resolver);
        assert.equal(scopesChecked.length, 3);
        assert.ok(scopesChecked.includes("scope1"));
        assert.ok(scopesChecked.includes("scope2"));
        assert.ok(scopesChecked.includes(undefined));
    });
});
