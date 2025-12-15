import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyAssignmentAlignment } from "../../src/printer/print.js";

function createAssignment(name, isGlobal = false) {
    return {
        type: "AssignmentExpression",
        operator: "=",
        left: {
            type: "Identifier",
            name,
            isGlobalIdentifier: isGlobal
        },
        right: {
            type: "Literal",
            value: 1
        }
    };
}

void describe("applyAssignmentAlignment", () => {
    void it("aligns local identifiers once grouping is enabled", () => {
        const statements = [
            createAssignment("short"),
            createAssignment("muchLonger")
        ];

        applyAssignmentAlignment(statements, {
            alignAssignmentsMinGroupSize: 2
        });

        const short = statements[0] as any;
        const long = statements[1] as any;

        assert.strictEqual(
            typeof short._alignAssignmentPadding,
            "number",
            "Expected short identifier to receive padding"
        );

        assert.strictEqual(
            short._alignAssignmentPadding > 0,
            true,
            "Short identifier should be padded to match the longest name"
        );

        assert.strictEqual(
            long._alignAssignmentPadding,
            0,
            "Longer identifier should not receive extra padding"
        );
    });

    void it("does not align global identifiers when declarations are elided", () => {
        const statements = [
            createAssignment("globalShort", true),
            createAssignment("globalLonger", true)
        ];

        applyAssignmentAlignment(statements, {
            alignAssignmentsMinGroupSize: 2,
            preserveGlobalVarStatements: false
        });

        const firstGlobal = statements[0] as any;
        const secondGlobal = statements[1] as any;

        assert.strictEqual(
            firstGlobal._alignAssignmentPadding,
            undefined,
            "Global assignments should be skipped when declarations are removed"
        );
        assert.strictEqual(
            secondGlobal._alignAssignmentPadding,
            undefined,
            "Global assignments should be skipped when declarations are removed"
        );
    });

    void it("aligns global identifiers when declarations are preserved", () => {
        const statements = [
            createAssignment("globalShort", true),
            createAssignment("globalLonger", true)
        ];

        applyAssignmentAlignment(statements, {
            alignAssignmentsMinGroupSize: 2,
            preserveGlobalVarStatements: true
        });

        const paddedGlobal = statements[0] as any;

        assert.strictEqual(
            typeof paddedGlobal._alignAssignmentPadding,
            "number",
            "Expected global identifier to receive padding when declarations remain"
        );
        assert.strictEqual(
            paddedGlobal._alignAssignmentPadding > 0,
            true,
            "Global identifier should be padded to match the longest name"
        );
    });
});
