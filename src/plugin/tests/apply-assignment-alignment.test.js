import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyAssignmentAlignment } from "../src/printer/print.js";

function createFunctionBodyPath(statements) {
    const block = { type: "BlockStatement", body: statements };
    const functionNode = { type: "FunctionDeclaration", body: block };

    return {
        getValue() {
            return block;
        },
        getParentNode(depth) {
            if (depth === undefined || depth === 0) {
                return functionNode;
            }

            return null;
        }
    };
}

function createProgramPath(statements) {
    const program = { type: "Program", body: statements };

    return {
        getValue() {
            return program;
        },
        getParentNode() {
            return null;
        }
    };
}

function createArgumentAliasDeclaration(name, argumentName) {
    const declarator = {
        type: "VariableDeclarator",
        id: { type: "Identifier", name },
        init: { type: "Identifier", name: argumentName }
    };

    return {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [declarator]
    };
}

describe("applyAssignmentAlignment", () => {
    it("iterates safely when the active group is mutated during traversal", () => {
        const statements = [];
        let capturedGroup = null;

        function createAssignment(name, shouldMutate = false) {
            let padding;
            return {
                type: "AssignmentExpression",
                operator: "=",
                left: { type: "Identifier", name },
                right: { type: "Literal", value: 1 },
                get _alignAssignmentPadding() {
                    return padding;
                },
                set _alignAssignmentPadding(value) {
                    padding = value;
                    if (shouldMutate && capturedGroup) {
                        capturedGroup.length = 0;
                    }
                }
            };
        }

        statements.push(
            createAssignment("alpha", true),
            createAssignment("beta"),
            createAssignment("gamma")
        );

        const originalPush = Array.prototype.push;
        try {
            Array.prototype.push = function (...args) {
                if (
                    !capturedGroup &&
                    this !== statements &&
                    Array.isArray(this) &&
                    args.length === 1 &&
                    args[0] &&
                    typeof args[0] === "object" &&
                    Object.hasOwn(args[0], "node") &&
                    Object.hasOwn(args[0], "nameLength")
                ) {
                    capturedGroup = this;
                }

                return originalPush.apply(this, args);
            };

            applyAssignmentAlignment(statements, {
                alignAssignmentsMinGroupSize: 1
            });
        } finally {
            Array.prototype.push = originalPush;
        }

        assert.ok(
            capturedGroup,
            "Expected to observe the alignment group array."
        );

        assert.deepStrictEqual(
            statements.map((node) => node._alignAssignmentPadding),
            [0, 1, 0],
            "All assignments should receive padding even if the backing array mutates."
        );
    });

    it("resets alignment groups across blank lines and leading comments", () => {
        const source = [
            "short = 1;",
            "",
            "// keep these separate",
            "longIdentifier = 2;",
            "third = 3;"
        ].join("\n");

        function createAssignment(name) {
            const statementText =
                name === "short"
                    ? "short = 1;"
                    : name === "longIdentifier"
                      ? "longIdentifier = 2;"
                      : "third = 3;";
            const start = source.indexOf(statementText);
            const end = start + statementText.length - 1;
            let padding = -1;
            return {
                type: "AssignmentExpression",
                operator: "=",
                left: { type: "Identifier", name },
                right: { type: "Literal", value: 0 },
                start,
                end,
                get _alignAssignmentPadding() {
                    return padding;
                },
                set _alignAssignmentPadding(value) {
                    padding = value;
                }
            };
        }

        const statements = [
            createAssignment("short"),
            createAssignment("longIdentifier"),
            createAssignment("third")
        ];

        applyAssignmentAlignment(statements, {
            alignAssignmentsMinGroupSize: 2,
            originalText: source
        });

        assert.deepStrictEqual(
            statements.map((node) => node._alignAssignmentPadding),
            [0, 0, "longIdentifier".length - "third".length],
            "Assignments separated by comments should not align with following groups."
        );
    });

    it("aligns argument aliases inside function bodies", () => {
        const statements = [
            createArgumentAliasDeclaration("w", "argument0"),
            createArgumentAliasDeclaration("widthAlias", "argument1"),
            createArgumentAliasDeclaration("height", "argument2")
        ];
        const path = createFunctionBodyPath(statements);

        applyAssignmentAlignment(
            statements,
            {
                alignAssignmentsMinGroupSize: 2
            },
            path,
            "body"
        );

        assert.deepStrictEqual(
            statements.map(
                (node) => node.declarations[0]._alignAssignmentPadding
            ),
            [
                "widthAlias".length - "w".length,
                0,
                "widthAlias".length - "height".length
            ],
            "Aliases declared inside function bodies should align using declarator padding."
        );
    });

    it("does not align argument aliases at the program level", () => {
        const statements = [
            createArgumentAliasDeclaration("alpha", "argument0"),
            createArgumentAliasDeclaration("betaAlias", "argument1")
        ];
        const programPath = createProgramPath(statements);

        applyAssignmentAlignment(
            statements,
            {
                alignAssignmentsMinGroupSize: 1
            },
            programPath,
            "body"
        );

        assert.deepStrictEqual(
            statements.map(
                (node) => node.declarations[0]._alignAssignmentPadding
            ),
            [undefined, undefined],
            "Aliases outside of function bodies should not receive alignment padding."
        );
    });
});
