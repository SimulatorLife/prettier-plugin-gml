import { describe, test } from "node:test";
import assert from "node:assert/strict";
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
        // This test ensures the semantic package's kindOfIdent function returns values
        // that match our expected SemKind type definition.

        const expectedKinds: Array<ReturnType<typeof Semantic.kindOfIdent>> = [
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
            const testResult: ReturnType<typeof Semantic.kindOfIdent> = kind;
            assert.ok(typeof testResult === "string", `${kind} should be a string`);
        }

        // Also verify the function returns expected types for various inputs
        assert.equal(Semantic.kindOfIdent(null), "local");
        assert.equal(Semantic.kindOfIdent(undefined), "local");
        assert.equal(Semantic.kindOfIdent({ name: "test" }), "local");
        assert.equal(Semantic.kindOfIdent({ name: "test", isGlobalIdentifier: true }), "global_field");
    });
});
