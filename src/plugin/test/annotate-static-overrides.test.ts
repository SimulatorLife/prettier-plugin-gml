import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Parser } from "@gml-modules/parser";

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

void describe("annotateStaticFunctionOverrides", () => {
    void it("marks overriding static functions", () => {
        const parentStatic = createStaticFunctionStatement("build") as any;
        const childStatic = createStaticFunctionStatement("build") as any;

        const ast = {
            type: "Program",
            body: [
                {
                    type: "ConstructorDeclaration",
                    id: { type: "Identifier", name: "Parent" },
                    body: {
                        type: "BlockStatement",
                        body: [parentStatic]
                    }
                },
                {
                    type: "ConstructorDeclaration",
                    id: { type: "Identifier", name: "Child" },
                    parent: {
                        type: "ConstructorParentClause",
                        id: { type: "Identifier", name: "Parent" }
                    },
                    body: {
                        type: "BlockStatement",
                        body: [childStatic]
                    }
                }
            ]
        };

        Parser.Transforms.annotateStaticFunctionOverrides(ast);

        assert.equal(parentStatic._overridesStaticFunction, undefined);
        assert.equal(childStatic._overridesStaticFunction, true);
    });

    void it("ignores static declarations without identifier targets", () => {
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
        } as any;

        const ast = {
            type: "Program",
            body: [
                {
                    type: "ConstructorDeclaration",
                    id: { type: "Identifier", name: "Parent" },
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

        Parser.Transforms.annotateStaticFunctionOverrides(ast);

        assert.equal(invalidStatic._overridesStaticFunction, undefined);
    });
});
