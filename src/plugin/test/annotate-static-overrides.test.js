import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { annotateStaticFunctionOverrides } from "../src/ast-transforms/annotate-static-overrides.js";

function createStaticFunctionStatement(name, overrides = {}) {
    return {
        type: "VariableDeclaration",
        kind: "static",
        declarations: [
            {
                type: "VariableDeclarator",
                id: { type: "Identifier", name },
                init: { type: "FunctionDeclaration" },
                ...overrides
            }
        ]
    };
}

describe("annotateStaticFunctionOverrides", () => {
    it("marks overriding static functions", () => {
        const parentStatic = createStaticFunctionStatement("build");
        const childStatic = createStaticFunctionStatement("build");

        const ast = {
            type: "Program",
            body: [
                {
                    type: "ConstructorDeclaration",
                    id: "Parent",
                    body: {
                        type: "BlockStatement",
                        body: [parentStatic]
                    }
                },
                {
                    type: "ConstructorDeclaration",
                    id: "Child",
                    parent: {
                        type: "ConstructorParentClause",
                        id: "Parent"
                    },
                    body: {
                        type: "BlockStatement",
                        body: [childStatic]
                    }
                }
            ]
        };

        annotateStaticFunctionOverrides(ast);

        assert.equal(parentStatic._overridesStaticFunction, undefined);
        assert.equal(childStatic._overridesStaticFunction, true);
    });

    it("ignores static declarations without identifier targets", () => {
        const invalidStatic = {
            type: "VariableDeclaration",
            kind: "static",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: null,
                    init: { type: "FunctionDeclaration" }
                }
            ]
        };

        const ast = {
            type: "Program",
            body: [
                {
                    type: "ConstructorDeclaration",
                    id: "Parent",
                    body: {
                        type: "BlockStatement",
                        body: [
                            createStaticFunctionStatement("build"),
                            invalidStatic
                        ]
                    }
                }
            ]
        };

        annotateStaticFunctionOverrides(ast);

        assert.equal(invalidStatic._overridesStaticFunction, undefined);
    });
});
