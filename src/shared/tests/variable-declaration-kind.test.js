import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getVariableDeclarationKind,
    isVariableDeclarationOfKind,
    isVarVariableDeclaration
} from "../ast-node-helpers.js";

describe("variable declaration helpers", () => {
    describe("getVariableDeclarationKind", () => {
        it("returns null for non-variable declaration nodes", () => {
            assert.equal(getVariableDeclarationKind(null), null);
            assert.equal(
                getVariableDeclarationKind({ type: "FunctionDeclaration" }),
                null
            );
        });

        it("normalizes variable declaration kinds to lowercase", () => {
            assert.equal(
                getVariableDeclarationKind({
                    type: "VariableDeclaration",
                    kind: "VaR"
                }),
                "var"
            );
        });

        it("returns null for missing or empty kinds", () => {
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

    describe("isVariableDeclarationOfKind", () => {
        it("guards against invalid inputs", () => {
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

        it("compares declaration kinds case-insensitively", () => {
            assert.equal(
                isVariableDeclarationOfKind(
                    { type: "VariableDeclaration", kind: "Var" },
                    "VAR"
                ),
                true
            );
        });
    });

    describe("isVarVariableDeclaration", () => {
        it("returns true only for 'var' declarations", () => {
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
