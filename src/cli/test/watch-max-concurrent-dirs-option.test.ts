import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createWatchCommand } from "../src/commands/watch.js";

void describe("watch command max-concurrent-dirs option", () => {
    void it("should have max-concurrent-dirs option", () => {
        const command = createWatchCommand();
        const maxConcurrentDirsOption = command.options.find((opt) => opt.long === "--max-concurrent-dirs");

        assert.ok(maxConcurrentDirsOption, "Should have --max-concurrent-dirs option");
        assert.equal(maxConcurrentDirsOption.defaultValue, 4, "Default max concurrent directories should be 4");
    });

    void it("should have max-concurrent-dirs with correct description", () => {
        const command = createWatchCommand();
        const maxConcurrentDirsOption = command.options.find((opt) => opt.long === "--max-concurrent-dirs");

        assert.ok(maxConcurrentDirsOption, "Should have --max-concurrent-dirs option");
        assert.ok(
            maxConcurrentDirsOption.description.includes("Maximum number of directories"),
            "Should have descriptive help text"
        );
        assert.ok(
            maxConcurrentDirsOption.description.includes("initial file discovery"),
            "Should mention initial file discovery"
        );
    });
});
