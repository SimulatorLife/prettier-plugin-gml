import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { type IdentifierMetadata, Semantic, type SemKind } from "@gmloop/semantic";

import { Transpiler } from "../index.js";
import type { CallExpressionNode, CallTargetAnalyzer, IdentifierAnalyzer } from "../src/emitter/ast.js";

/**
 * Type-contract tests for the semantic oracle / transpiler boundary.
 *
 * These tests verify:
 * 1. `SemKind` and `IdentifierMetadata` are importable as standalone types from
 *    `@gmloop/semantic` (regression guard for the workspace type-export surface).
 * 2. `BasicSemanticOracle` satisfies the transpiler's `IdentifierAnalyzer` and
 *    `CallTargetAnalyzer` contracts so that oracle substitution works correctly.
 * 3. `createSemanticOracle()` returns an oracle that fulfils both interfaces.
 */

void describe("Semantic oracle type contracts", () => {
    void test("SemKind is exported as a standalone type from @gmloop/semantic", () => {
        // Compile-time assertion: assigning a SemKind literal must type-check.
        const kind: SemKind = "local";
        assert.equal(kind, "local");
    });

    void test("IdentifierMetadata is exported as a standalone type from @gmloop/semantic", () => {
        const meta: IdentifierMetadata = { name: "health" };
        assert.equal(meta.name, "health");

        const globalMeta: IdentifierMetadata = { name: "global_counter", isGlobalIdentifier: true };
        assert.equal(globalMeta.isGlobalIdentifier, true);
    });

    void test("BasicSemanticOracle satisfies IdentifierAnalyzer and CallTargetAnalyzer", () => {
        // Assigning to the transpiler's interface types validates structural compatibility
        // at compile time. If the oracle drifts from the interface contracts this test
        // will fail during TypeScript compilation.
        const identifierAnalyzer: IdentifierAnalyzer = new Semantic.BasicSemanticOracle(null, new Set(), new Set());
        const callTargetAnalyzer: CallTargetAnalyzer = new Semantic.BasicSemanticOracle(null, new Set(), new Set());

        assert.equal(typeof identifierAnalyzer.kindOfIdent, "function");
        assert.equal(typeof identifierAnalyzer.nameOfIdent, "function");
        assert.equal(typeof identifierAnalyzer.qualifiedSymbol, "function");
        assert.equal(typeof callTargetAnalyzer.callTargetKind, "function");
        assert.equal(typeof callTargetAnalyzer.callTargetSymbol, "function");
    });

    void test("createSemanticOracle returns an oracle compatible with both interfaces", () => {
        const oracle = Transpiler.createSemanticOracle();

        const identifierAnalyzer: IdentifierAnalyzer = oracle;
        const callTargetAnalyzer: CallTargetAnalyzer = oracle;

        // Verify known SemKind values are returned correctly.
        assert.equal(identifierAnalyzer.kindOfIdent(null), "local");
        assert.equal(identifierAnalyzer.kindOfIdent(undefined), "local");
        assert.equal(identifierAnalyzer.kindOfIdent({ name: "test" }), "local");
        assert.equal(identifierAnalyzer.kindOfIdent({ name: "test", isGlobalIdentifier: true }), "global_field");

        // callTargetKind should return a recognised value for an unknown target.
        const mockCallNode: CallExpressionNode = {
            type: "CallExpression",
            object: { type: "Identifier", name: "unknownFn" },
            arguments: []
        };
        const kind = callTargetAnalyzer.callTargetKind(mockCallNode);
        assert.ok(["script", "builtin", "unknown"].includes(kind), `Unexpected kind: ${kind}`);
    });

    void test("SemKind covers all classification categories", () => {
        const validKinds: SemKind[] = ["local", "self_field", "other_field", "global_field", "builtin", "script"];

        for (const kind of validKinds) {
            assert.equal(typeof kind, "string");
        }
    });
});
