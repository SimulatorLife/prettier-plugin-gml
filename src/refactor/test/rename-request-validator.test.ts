/**
 * Tests for standalone rename request validation functions:
 * computeRenameValidation and validateBatchRenameRequests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeRenameValidation, validateBatchRenameRequests } from "../src/rename-request-validator.js";
import { SemanticQueryCache } from "../src/semantic-cache.js";
import type { PartialSemanticAnalyzer, SymbolOccurrence, ValidationSummary } from "../src/types.js";

void describe("computeRenameValidation", () => {
    void it("returns error when symbolId is missing", async () => {
        const cache = new SemanticQueryCache(null);
        const result = await computeRenameValidation(
            { symbolId: "", newName: "scr_bar" } as never,
            undefined,
            null,
            cache
        );
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("required")));
    });

    void it("returns error when newName is missing", async () => {
        const cache = new SemanticQueryCache(null);
        const result = await computeRenameValidation(
            { symbolId: "gml/script/scr_foo", newName: "" } as never,
            undefined,
            null,
            cache
        );
        assert.equal(result.valid, false);
    });

    void it("returns error for invalid identifier syntax", async () => {
        const cache = new SemanticQueryCache(null);
        const result = await computeRenameValidation(
            { symbolId: "gml/script/scr_foo", newName: "123invalid" },
            undefined,
            null,
            cache
        );
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.toLowerCase().includes("identifier")));
    });

    void it("warns when semantic analyzer is unavailable", async () => {
        const cache = new SemanticQueryCache(null);
        const result = await computeRenameValidation(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            undefined,
            null,
            cache
        );
        assert.ok(result.warnings.some((w) => /semantic/i.test(w)));
    });

    void it("returns error when symbol does not exist", async () => {
        const semantic: PartialSemanticAnalyzer = { hasSymbol: async () => false };
        const cache = new SemanticQueryCache(semantic);

        const result = await computeRenameValidation(
            { symbolId: "gml/script/scr_ghost", newName: "scr_new" },
            undefined,
            semantic,
            cache
        );
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("not found")));
    });

    void it("returns error when new name matches existing name", async () => {
        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => []
        };
        const cache = new SemanticQueryCache(semantic);

        const result = await computeRenameValidation(
            { symbolId: "gml/script/scr_foo", newName: "scr_foo" },
            undefined,
            semantic,
            cache
        );
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("matches")));
    });

    void it("returns valid result with occurrence count", async () => {
        const occurrences: Array<SymbolOccurrence> = [
            { path: "scripts/a.gml", start: 0, end: 7 },
            { path: "scripts/b.gml", start: 5, end: 12 }
        ];
        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => occurrences,
            getReservedKeywords: async () => [],
            lookup: async () => null
        };
        const cache = new SemanticQueryCache(semantic);

        const result = await computeRenameValidation(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            undefined,
            semantic,
            cache
        );

        assert.equal(result.valid, true);
        assert.equal(result.occurrenceCount, 2);
        assert.equal(result.symbolName, "scr_foo");
    });

    void it("includes hot reload result when includeHotReload is true", async () => {
        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => []
        };
        const cache = new SemanticQueryCache(semantic);

        const safetyResult = {
            safe: true,
            reason: "safe",
            requiresRestart: false,
            canAutoFix: true,
            suggestions: [] as Array<string>
        };
        const checker = async () => safetyResult;

        const result = await computeRenameValidation(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            { includeHotReload: true },
            semantic,
            cache,
            checker
        );

        assert.ok(result.hotReload !== undefined, "hotReload should be populated");
        assert.equal(result.hotReload?.safe, true);
    });
});

void describe("validateBatchRenameRequests", () => {
    // Shared fixture: a no-op validator that always returns valid.
    async function noopValidateSingle(): Promise<ValidationSummary> {
        return { valid: true, errors: [], warnings: [] };
    }

    // Shared fixture: a validator that always returns an error.
    async function validateFailing(): Promise<ValidationSummary> {
        return { valid: false, errors: ["Name already taken"], warnings: [] };
    }

    void it("returns error when renames is not an array", async () => {
        const result = await validateBatchRenameRequests(null as never, undefined, noopValidateSingle);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("array")));
    });

    void it("returns error when renames is empty", async () => {
        const result = await validateBatchRenameRequests([], undefined, noopValidateSingle);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("at least one")));
    });

    void it("propagates per-rename validation errors", async () => {
        const result = await validateBatchRenameRequests(
            [{ symbolId: "gml/script/scr_a", newName: "scr_x" }],
            undefined,
            validateFailing
        );

        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("scr_a")));
    });

    void it("detects duplicate symbolIds in the batch", async () => {
        const result = await validateBatchRenameRequests(
            [
                { symbolId: "gml/script/scr_a", newName: "scr_x" },
                { symbolId: "gml/script/scr_a", newName: "scr_y" }
            ],
            undefined,
            noopValidateSingle
        );

        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("Duplicate rename request")));
    });

    void it("detects duplicate target names across the batch", async () => {
        const result = await validateBatchRenameRequests(
            [
                { symbolId: "gml/script/scr_a", newName: "scr_same" },
                { symbolId: "gml/script/scr_b", newName: "scr_same" }
            ],
            undefined,
            noopValidateSingle
        );

        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("Multiple symbols")));
    });

    void it("detects circular rename chains", async () => {
        const result = await validateBatchRenameRequests(
            [
                { symbolId: "gml/script/scr_a", newName: "scr_b" },
                { symbolId: "gml/script/scr_b", newName: "scr_a" }
            ],
            undefined,
            noopValidateSingle
        );

        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.toLowerCase().includes("circular")));
    });

    void it("warns when a new name matches an old name in the same batch (confusion risk)", async () => {
        // Renaming scr_b to something means scr_a being renamed TO scr_b could
        // confuse readers if there's a chain: scr_a → scr_b and scr_c → scr_a.
        // Specifically: if scr_c is renamed to scr_a (which is also an old name in this
        // batch), the validator emits a confusion warning.
        const result = await validateBatchRenameRequests(
            [
                { symbolId: "gml/script/scr_a", newName: "scr_new" }, // scr_a is an old name
                { symbolId: "gml/script/scr_c", newName: "scr_a" } // scr_a was an old name — confusion!
            ],
            undefined,
            async () => ({ valid: true, errors: [], warnings: [] })
        );

        // The batch is structurally valid (no circular chain, no duplicate targets),
        // but a confusion warning should be emitted because `scr_a` is being used as
        // both a new name and was an old name in the same batch.
        assert.equal(result.valid, true);
        assert.ok(
            result.warnings.some((w) => w.includes("confusion")),
            `Expected confusion warning; got: ${result.warnings.join(", ")}`
        );
    });

    void it("does not warn when new names don't match any old names", async () => {
        const result = await validateBatchRenameRequests(
            [
                { symbolId: "gml/script/scr_a", newName: "scr_x" },
                { symbolId: "gml/script/scr_c", newName: "scr_d" }
            ],
            undefined,
            async () => ({ valid: true, errors: [], warnings: [] })
        );

        assert.equal(result.valid, true);
        assert.equal(result.warnings.filter((w) => w.includes("confusion")).length, 0);
    });

    void it("returns per-rename validation map", async () => {
        const result = await validateBatchRenameRequests(
            [
                { symbolId: "gml/script/scr_a", newName: "scr_x" },
                { symbolId: "gml/script/scr_b", newName: "scr_y" }
            ],
            undefined,
            noopValidateSingle
        );

        assert.equal(result.valid, true);
        assert.equal(result.renameValidations.size, 2);
        assert.ok(result.renameValidations.has("gml/script/scr_a"));
        assert.ok(result.renameValidations.has("gml/script/scr_b"));
    });
});
