import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";
import { BasicSemanticOracle } from "../src/symbols/sem-oracle.js";

/**
 * Tests for `self_field` classification in `BasicSemanticOracle`.
 *
 * In GML, identifiers accessed inside an object event without a local
 * declaration are implicitly instance (self) field accesses. The oracle
 * must return `"self_field"` for these so the transpiler emits `self.x`
 * rather than a bare `x`.
 */
void describe("BasicSemanticOracle: self_field classification", () => {
    void describe("object_event scope kind", () => {
        void it("classifies unresolved identifier as self_field inside object_event scope", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "hp" }), "self_field");
        });

        void it("classifies multiple unresolved identifiers as self_field", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "x" }), "self_field");
            assert.strictEqual(oracle.kindOfIdent({ name: "y" }), "self_field");
            assert.strictEqual(oracle.kindOfIdent({ name: "speed" }), "self_field");
            assert.strictEqual(oracle.kindOfIdent({ name: "image_index" }), "self_field");
        });

        void it("still returns local for identifier declared in scope chain", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");
            tracker.declare("localVar", { start: { line: 1, index: 0 }, end: { line: 1, index: 9 } });

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "localVar" }), "local");
        });

        void it("still returns global_field for isGlobalIdentifier inside object_event", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "globalScore", isGlobalIdentifier: true }), "global_field");
        });

        void it("still returns builtin inside object_event for known builtin", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");

            const builtins = new Set(["show_debug_message"]);
            const oracle = new BasicSemanticOracle(tracker, builtins);

            assert.strictEqual(oracle.kindOfIdent({ name: "show_debug_message" }), "builtin");
        });

        void it("still returns script inside object_event for known script", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");

            const scripts = new Set(["scr_move_player"]);
            const oracle = new BasicSemanticOracle(tracker, new Set(), scripts);

            assert.strictEqual(oracle.kindOfIdent({ name: "scr_move_player" }), "script");
        });

        void it("classifies identifier as self_field when nested in a block inside object_event", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");
            // Simulate an if/with block nested inside the event
            tracker.enterScope("block");

            const oracle = new BasicSemanticOracle(tracker);

            // Not declared locally, but inside an object_event ancestor scope
            assert.strictEqual(oracle.kindOfIdent({ name: "direction" }), "self_field");
        });

        void it("prioritizes local declaration over self_field even with object_event ancestor", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");
            tracker.enterScope("block");
            // Declare in the inner block scope
            tracker.declare("temp", { start: { line: 2, index: 4 }, end: { line: 2, index: 8 } });

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "temp" }), "local");
        });
    });

    void describe("object_body scope kind", () => {
        void it("classifies unresolved identifier as self_field inside object_body scope", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_body");

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "health" }), "self_field");
        });
    });

    void describe("non-self-context scopes", () => {
        void it("returns local (not self_field) when no object_event in scope stack", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program");

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "hp" }), "local");
        });

        void it("returns local when inside a script scope (not an object event)", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("script");

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "arg" }), "local");
        });

        void it("returns local when no tracker is provided regardless of node properties", () => {
            const oracle = new BasicSemanticOracle(null);

            assert.strictEqual(oracle.kindOfIdent({ name: "hp" }), "local");
        });
    });

    void describe("custom selfContextScopeKinds", () => {
        void it("uses custom scope kind set when provided", () => {
            const tracker = new ScopeTracker({ enabled: true });
            // Enter a scope with a project-specific kind
            tracker.enterScope("create_event");

            const oracle = new BasicSemanticOracle(tracker, new Set(), new Set(), new Set(["create_event"]));

            assert.strictEqual(oracle.kindOfIdent({ name: "hp" }), "self_field");
        });

        void it("does not classify as self_field when using default kinds and scope is create_event", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("create_event");

            // Default oracle does NOT treat "create_event" as a self context
            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.kindOfIdent({ name: "hp" }), "local");
        });

        void it("empty selfContextScopeKinds disables self_field classification entirely", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");

            const oracle = new BasicSemanticOracle(tracker, new Set(), new Set(), new Set());

            // Even inside object_event, no self_field when the kind set is empty
            assert.strictEqual(oracle.kindOfIdent({ name: "hp" }), "local");
        });
    });

    void describe("qualifiedSymbol returns null for self_field", () => {
        void it("self_field identifiers have no project-wide SCIP symbol", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");

            const oracle = new BasicSemanticOracle(tracker);

            assert.strictEqual(oracle.qualifiedSymbol({ name: "x" }), null);
            assert.strictEqual(oracle.qualifiedSymbol({ name: "hp" }), null);
        });
    });

    void describe("classification priority within object_event", () => {
        void it("applies correct priority: global > builtin > script > local > self_field", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("object_event");
            tracker.declare("declaredLocal", {
                start: { line: 2, index: 0 },
                end: { line: 2, index: 13 }
            });

            const builtins = new Set(["array_length"]);
            const scripts = new Set(["scr_update"]);
            const oracle = new BasicSemanticOracle(tracker, builtins, scripts);

            // 1. global marker wins
            assert.strictEqual(oracle.kindOfIdent({ name: "score", isGlobalIdentifier: true }), "global_field");
            // 2. builtin wins over scope
            assert.strictEqual(oracle.kindOfIdent({ name: "array_length" }), "builtin");
            // 3. script wins over scope
            assert.strictEqual(oracle.kindOfIdent({ name: "scr_update" }), "script");
            // 4. locally declared variable stays local
            assert.strictEqual(oracle.kindOfIdent({ name: "declaredLocal" }), "local");
            // 5. unresolved inside object_event → self_field
            assert.strictEqual(oracle.kindOfIdent({ name: "hp" }), "self_field");
        });
    });
});
