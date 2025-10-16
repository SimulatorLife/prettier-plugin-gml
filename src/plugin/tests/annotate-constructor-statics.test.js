import assert from "node:assert/strict";
import { test } from "node:test";

import { annotateConstructorStatics } from "../src/ast-transforms/annotate-constructor-statics.js";

const sourceText = [
    "/// @hide",
    "function Base() constructor {",
    "    /// @function print",
    "    static print = function() {",
    "    };",
    "}",
    "",
    "function Child() : Base() constructor {",
    "    static print = function() {",
    "    };",
    "}"
].join("\n");

const baseConstructorStart = sourceText.indexOf("function Base");
const baseStaticStart = sourceText.indexOf(
    "static print",
    baseConstructorStart
);
const childConstructorStart = sourceText.indexOf("function Child");
const childStaticStart = sourceText.indexOf(
    "static print",
    childConstructorStart
);

const sampleAst = {
    type: "Program",
    body: [
        {
            type: "ConstructorDeclaration",
            start: baseConstructorStart,
            id: "Base",
            parent: null,
            body: {
                type: "BlockStatement",
                body: [
                    {
                        type: "VariableDeclaration",
                        kind: "static",
                        start: baseStaticStart,
                        declarations: [
                            {
                                type: "VariableDeclarator",
                                id: { type: "Identifier", name: "print" },
                                init: {
                                    type: "FunctionDeclaration",
                                    params: [],
                                    body: { type: "BlockStatement", body: [] }
                                }
                            }
                        ]
                    }
                ]
            }
        },
        {
            type: "ConstructorDeclaration",
            start: childConstructorStart,
            id: "Child",
            parent: { id: "Base" },
            body: {
                type: "BlockStatement",
                body: [
                    {
                        type: "VariableDeclaration",
                        kind: "static",
                        start: childStaticStart,
                        declarations: [
                            {
                                type: "VariableDeclarator",
                                id: { type: "Identifier", name: "print" },
                                init: {
                                    type: "FunctionDeclaration",
                                    params: [],
                                    body: { type: "BlockStatement", body: [] }
                                }
                            }
                        ]
                    }
                ]
            }
        }
    ]
};

test("annotateConstructorStatics marks overrides without hanging", () => {
    annotateConstructorStatics(sampleAst, { sourceText });

    const baseStatic = sampleAst.body[0].body.body[0].declarations[0].init;
    const childStatic = sampleAst.body[1].body.body[0].declarations[0].init;

    assert.equal(
        baseStatic._suppressSyntheticReturnsDoc,
        true,
        "hidden constructor statics should suppress returns"
    );

    assert.equal(
        childStatic._docCommentOverride,
        true,
        "derived constructor statics should be marked as overrides"
    );
});
