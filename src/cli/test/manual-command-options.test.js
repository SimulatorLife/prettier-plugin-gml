import assert from "node:assert/strict";
import test from "node:test";

import { applySharedManualCommandOptions } from "../src/modules/manual/command-options.js";

test("manual command executes remaining option handlers even when mutated", () => {
    const executed = [];
    const command = {
        option(flag, description, ...rest) {
            executed.push({ flag, description, rest });
            return command;
        }
    };

    const originalSet = Map.prototype.set;
    let capturedHandlers = null;

    Map.prototype.set = function patchedSet(key, value) {
        if (capturedHandlers === null && key === "alphaOption") {
            capturedHandlers = this;
        }
        return originalSet.call(this, key, value);
    };

    const customOptions = {
        alphaOption() {
            executed.push("alpha");
            capturedHandlers?.delete("betaOption");
        },
        betaOption() {
            executed.push("beta");
        }
    };

    try {
        applySharedManualCommandOptions(command, {
            customOptions,
            optionOrder: [],
            outputPath: { defaultValue: "." },
            cacheRoot: { defaultValue: "." },
            manualRepo: { defaultValue: "owner/repo" },
            progressBarWidth: { defaultValue: 40 },
            quietDescription: false,
            forceRefreshDescription: false
        });
    } finally {
        Map.prototype.set = originalSet;
    }

    assert.deepEqual(
        executed.filter((value) => typeof value === "string"),
        ["alpha", "beta"],
        "all manual option handlers should run despite mutations"
    );
});
