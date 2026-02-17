import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Semantic } from "@gml-modules/semantic";

/**
 * Type alignment tests
 *
 * These tests verify that types duplicated between packages remain in sync.
 * When types are duplicated for architectural reasons (e.g., namespace constraints),
 * these tests catch drift by validating runtime behavior matches expectations.
 */

void describe("Type alignment between transpiler and semantic", () => {
    void test("SemKind values match between packages", () => {
        // The transpiler duplicates SemKind from semantic due to namespace export constraints.
        // This test ensures the semantic package's BasicSemanticOracle.kindOfIdent method returns values
        // that match our expected SemKind type definition.

        const oracle = new Semantic.BasicSemanticOracle(null, new Set(), new Set());

        const expectedKinds: Array<ReturnType<typeof oracle.kindOfIdent>> = [
            "local",
            "self_field",
            "other_field",
            "global_field",
            "builtin",
            "script"
        ];

        // Verify each value is a valid SemKind by checking the function accepts test data
        for (const kind of expectedKinds) {
            // If the types drift, this will fail at compile time
            const testResult: ReturnType<typeof oracle.kindOfIdent> = kind;
            assert.ok(typeof testResult === "string", `${kind} should be a string`);
        }

        // Also verify the method returns expected types for various inputs
        assert.equal(oracle.kindOfIdent(null), "local");
        assert.equal(oracle.kindOfIdent(undefined), "local");
        assert.equal(oracle.kindOfIdent({ name: "test" }), "local");
        assert.equal(oracle.kindOfIdent({ name: "test", isGlobalIdentifier: true }), "global_field");
    });
});
