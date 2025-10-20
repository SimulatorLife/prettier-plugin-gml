import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyAssignmentAlignment } from "../src/printer/print.js";

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
});
