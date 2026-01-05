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
        const statements = [createAssignment("short"), createAssignment("muchLonger")];

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

        assert.strictEqual(long._alignAssignmentPadding, 0, "Longer identifier should not receive extra padding");
    });

    void it("aligns global identifiers even when declarations are elided", () => {
        const statements = [createAssignment("globalShort", true), createAssignment("globalLonger", true)];

        applyAssignmentAlignment(statements, {
            alignAssignmentsMinGroupSize: 2,
            preserveGlobalVarStatements: false
        });

        const firstGlobal = statements[0] as any;
        const secondGlobal = statements[1] as any;

        assert.strictEqual(
            typeof firstGlobal._alignAssignmentPadding,
            "number",
            "Global assignments should receive padding even when declarations are elided"
        );
        assert.strictEqual(
            firstGlobal._alignAssignmentPadding > 0,
            true,
            "Global identifier should be padded to match the longest name"
        );
        assert.strictEqual(
            typeof secondGlobal._alignAssignmentPadding,
            "number",
            "Every entry in the group should receive a padding value"
        );
    });

    void it("aligns global identifiers when declarations are preserved", () => {
        const statements = [createAssignment("globalShort", true), createAssignment("globalLonger", true)];

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

    void it("uses default minimum group size when option is not specified", () => {
        const statements = [createAssignment("a"), createAssignment("b"), createAssignment("c")];

        applyAssignmentAlignment(statements, {});

        const first = statements[0] as any;
        const second = statements[1] as any;
        const third = statements[2] as any;

        assert.strictEqual(
            typeof first._alignAssignmentPadding,
            "number",
            "Should align when group meets default size of 3"
        );
        assert.strictEqual(first._alignAssignmentPadding, 0, "First assignment should not need padding");
        assert.strictEqual(second._alignAssignmentPadding, 0, "Second assignment should not need padding");
        assert.strictEqual(third._alignAssignmentPadding, 0, "Third assignment should not need padding");
    });

    void it("does not align when group is smaller than default minimum", () => {
        const statements = [createAssignment("short"), createAssignment("longer")];

        applyAssignmentAlignment(statements, {});

        const first = statements[0] as any;
        const second = statements[1] as any;

        assert.strictEqual(first._alignAssignmentPadding, 0, "Should not align with only 2 assignments (default is 3)");
        assert.strictEqual(
            second._alignAssignmentPadding,
            0,
            "Should not align with only 2 assignments (default is 3)"
        );
    });
});
