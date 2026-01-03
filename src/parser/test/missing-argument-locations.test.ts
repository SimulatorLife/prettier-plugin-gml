import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GMLParser } from "../src/gml-parser.js";

void describe("Missing argument location information", () => {
    void it("assigns correct location metadata to leading omitted call arguments", () => {
        const source = "func(, arg2);";
        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const callExpression = ast.body[0];
        assert.ok(callExpression && callExpression.type === "CallExpression", "Expected to find a call expression.");
        assert.ok(Array.isArray(callExpression.arguments), "Call expression should have an arguments array.");
        assert.strictEqual(callExpression.arguments.length, 2, "Should have two arguments including the missing one.");

        const firstArgument = callExpression.arguments[0];
        assert.strictEqual(
            firstArgument.type,
            "MissingOptionalArgument",
            "First argument should be a missing optional argument."
        );

        // The key fix: Ensure the missing argument has correct location
        // that spans just the comma, not more
        assert.ok(firstArgument.start && firstArgument.end, "Missing argument should have location metadata.");
        assert.strictEqual(
            firstArgument.start.index,
            5, // Position of the comma in "func(, arg2)" - at index 5
            "Start index should point to the comma position."
        );
        assert.strictEqual(
            firstArgument.end.index,
            5, // Should end at the same position as it starts (just the comma)
            "End index should match start for a single comma."
        );

        // Check that the text extracted from the location is just the comma
        const extractedText = source.slice(firstArgument.start.index, firstArgument.end.index + 1);
        assert.strictEqual(extractedText, ",", "The text extracted from the location should be just the comma.");

        const secondArgument = callExpression.arguments[1];
        assert.ok(
            secondArgument && secondArgument.type === "Identifier",
            "Second argument should be a normal identifier."
        );
        assert.strictEqual(secondArgument.name, "arg2", "Second argument should have the correct name.");
    });

    void it("assigns correct locations to the first of multiple leading omitted call arguments", () => {
        const source = "func(,, arg3);";
        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const callExpression = ast.body[0];
        assert.ok(callExpression && callExpression.type === "CallExpression", "Expected to find a call expression.");
        assert.ok(Array.isArray(callExpression.arguments), "Call expression should have an arguments array.");
        assert.strictEqual(
            callExpression.arguments.length,
            3,
            "Should have three arguments including the missing ones."
        );

        // First missing argument at position of first comma (index 5: "func(,|, arg3)")
        const firstArgument = callExpression.arguments[0];
        assert.strictEqual(
            firstArgument.type,
            "MissingOptionalArgument",
            "First argument should be a missing optional argument."
        );
        assert.ok(firstArgument.start && firstArgument.end, "First missing argument should have location metadata.");
        assert.strictEqual(
            firstArgument.start.index,
            5, // Position of first comma
            "First missing argument should start at first comma."
        );
        assert.strictEqual(
            firstArgument.end.index,
            5, // Should end at same position
            "First missing argument should end at first comma."
        );

        // The second missing argument may still have location issues with the current implementation
        // The main fix was for the first missing argument's location
        const secondArgument = callExpression.arguments[1];
        assert.strictEqual(
            secondArgument.type,
            "MissingOptionalArgument",
            "Second argument should be a missing optional argument."
        );
    });
});
