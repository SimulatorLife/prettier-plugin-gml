import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPerformanceCommand } from "../features/performance/index.js";

describe("performance CLI iterations option", () => {
    it("parses positive iteration counts from strings", () => {
        const command = createPerformanceCommand();

        command.parse(["--iterations", "5"], { from: "user" });

        assert.equal(command.opts().iterations, 5);
    });

    it("rejects non-positive iteration counts", () => {
        const command = createPerformanceCommand();

        assert.throws(
            () => command.parse(["--iterations", "0"], { from: "user" }),
            (error) => {
                assert.equal(error?.code, "commander.invalidArgument");
                assert.match(error?.message ?? "", /positive integer/i);
                return true;
            }
        );
    });
});
