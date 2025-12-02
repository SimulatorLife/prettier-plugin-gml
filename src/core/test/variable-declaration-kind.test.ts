import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getVariableDeclarationKind,
    isVariableDeclarationOfKind,
    isVarVariableDeclaration
} from "../src/ast/node-helpers.js";

void describe("variable declaration helpers", () => {
    void describe("getVariableDeclarationKind", () => {
        void it("returns null for non-variable declaration nodes", () => {
            assert.equal(getVariableDeclarationKind(null), null);
            assert.equal(
                getVariableDeclarationKind({ type: "FunctionDeclaration" }),
                null
            );
        });

        void it("normalizes variable declaration kinds to lowercase", () => {
            assert.equal(
                getVariableDeclarationKind({
                    type: "VariableDeclaration",
                    kind: "VaR"
                }),
                "var"
            );
        });

        void it("returns null for missing or empty kinds", () => {
            assert.equal(
                getVariableDeclarationKind({
                    type: "VariableDeclaration"
                }),
                null
            );

            assert.equal(
                getVariableDeclarationKind({
                    type: "VariableDeclaration",
                    kind: ""
                }),
                null
            );
        });
    });

    void describe("isVariableDeclarationOfKind", () => {
        void it("guards against invalid inputs", () => {
            assert.equal(isVariableDeclarationOfKind(null, "var"), false);
            assert.equal(
                isVariableDeclarationOfKind(
                    { type: "VariableDeclaration", kind: "let" },
                    "var"
                ),
                false
            );
            assert.equal(
                isVariableDeclarationOfKind(
                    { type: "VariableDeclaration" },
                    ""
                ),
                false
            );
        });

        void it("compares declaration kinds case-insensitively", () => {
            assert.equal(
                isVariableDeclarationOfKind(
                    { type: "VariableDeclaration", kind: "Var" },
                    "VAR"
                ),
                true
            );
        });
    });

    void describe("isVarVariableDeclaration", () => {
        void it("returns true only for 'var' declarations", () => {
            assert.equal(
                isVarVariableDeclaration({
                    type: "VariableDeclaration",
                    kind: "var"
                }),
                true
            );

            assert.equal(
                isVarVariableDeclaration({
                    type: "VariableDeclaration",
                    kind: "let"
                }),
                false
            );
        });
    });
});
