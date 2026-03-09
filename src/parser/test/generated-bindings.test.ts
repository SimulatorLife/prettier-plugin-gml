import assert from "node:assert/strict";
import { describe, it } from "node:test";

import GameMakerLanguageParserListener from "../src/runtime/game-maker-language-parser-listener.js";
import {
    PARSE_TREE_VISITOR_PROTOTYPE,
    PARSER_LISTENER_BASE,
    PARSER_VISITOR_BASE
} from "../src/runtime/generated-bindings.js";
// Import the same constants through the runtime barrel to verify that the
// barrel re-exports resolve to the same module-level reference.
import {
    PARSE_TREE_VISITOR_PROTOTYPE as RUNTIME_PARSE_TREE_VISITOR_PROTOTYPE,
    PARSER_LISTENER_BASE as RUNTIME_LISTENER_BASE,
    PARSER_VISITOR_BASE as RUNTIME_VISITOR_BASE
} from "../src/runtime/index.js";

/**
 * Regression tests for the generated-bindings facade.
 *
 * These tests guard the KISS simplification that replaced three single-call
 * factory functions (getParserListenerBase, getParserVisitorBase,
 * getParseTreeVisitorPrototype) with direct named-constant exports
 * (PARSER_LISTENER_BASE, PARSER_VISITOR_BASE, PARSE_TREE_VISITOR_PROTOTYPE).
 * The observable contract is identical: the constants expose the same
 * constructors and prototype that consumers depended on via the old getters.
 */
void describe("generated-bindings constants", () => {
    void describe("PARSER_LISTENER_BASE", () => {
        void it("is a constructor function", () => {
            assert.equal(typeof PARSER_LISTENER_BASE, "function");
        });

        void it("is the base class of GameMakerLanguageParserListener", () => {
            const listener = new GameMakerLanguageParserListener();
            assert.ok(
                listener instanceof PARSER_LISTENER_BASE,
                "GameMakerLanguageParserListener instance should be instanceof PARSER_LISTENER_BASE"
            );
        });
    });

    void describe("PARSER_VISITOR_BASE", () => {
        void it("is a constructor function", () => {
            assert.equal(typeof PARSER_VISITOR_BASE, "function");
        });

        void it("has a prototype with visitChildren", () => {
            assert.equal(typeof PARSER_VISITOR_BASE.prototype.visitChildren, "function");
        });
    });

    void describe("PARSE_TREE_VISITOR_PROTOTYPE", () => {
        void it("is an object with a visitChildren method", () => {
            assert.equal(typeof PARSE_TREE_VISITOR_PROTOTYPE, "object");
            assert.equal(typeof PARSE_TREE_VISITOR_PROTOTYPE.visitChildren, "function");
        });

        void it("is the prototype of PARSER_VISITOR_BASE.prototype", () => {
            assert.strictEqual(
                Object.getPrototypeOf(PARSER_VISITOR_BASE.prototype),
                PARSE_TREE_VISITOR_PROTOTYPE,
                "PARSE_TREE_VISITOR_PROTOTYPE should be the prototype of PARSER_VISITOR_BASE.prototype"
            );
        });
    });

    void describe("cross-module identity", () => {
        void it("PARSER_LISTENER_BASE is the same reference when imported via the runtime barrel", () => {
            assert.strictEqual(
                PARSER_LISTENER_BASE,
                RUNTIME_LISTENER_BASE,
                "generated-bindings and runtime/index should resolve to the same PARSER_LISTENER_BASE reference"
            );
        });

        void it("PARSER_VISITOR_BASE is the same reference when imported via the runtime barrel", () => {
            assert.strictEqual(
                PARSER_VISITOR_BASE,
                RUNTIME_VISITOR_BASE,
                "generated-bindings and runtime/index should resolve to the same PARSER_VISITOR_BASE reference"
            );
        });

        void it("PARSE_TREE_VISITOR_PROTOTYPE is the same reference when imported via the runtime barrel", () => {
            assert.strictEqual(
                PARSE_TREE_VISITOR_PROTOTYPE,
                RUNTIME_PARSE_TREE_VISITOR_PROTOTYPE,
                "generated-bindings and runtime/index should resolve to the same PARSE_TREE_VISITOR_PROTOTYPE reference"
            );
        });
    });
});
