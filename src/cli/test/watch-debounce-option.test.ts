import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createWatchCommand } from "../src/commands/watch.js";

void describe("watch command debounce option", () => {
    void it("should have debounce-delay option", () => {
        const command = createWatchCommand();
        const debounceOption = command.options.find((opt) => opt.long === "--debounce-delay");

        assert.ok(debounceOption, "Should have --debounce-delay option");
        assert.equal(debounceOption.defaultValue, 200, "Default debounce delay should be 200ms");
    });

    void it("should have debounce-delay with correct description", () => {
        const command = createWatchCommand();
        const debounceOption = command.options.find((opt) => opt.long === "--debounce-delay");

        assert.ok(debounceOption, "Should have --debounce-delay option");
        assert.ok(debounceOption.description.includes("Delay in milliseconds"), "Should have descriptive help text");
        assert.ok(
            debounceOption.description.includes("0 for immediate processing"),
            "Should mention zero for immediate processing"
        );
    });
});
