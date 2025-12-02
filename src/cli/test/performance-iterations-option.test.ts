import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPerformanceCommand } from "../src/commands/performance.js";
import type { ParseOptions } from "commander";

const USER_PARSE_OPTIONS: ParseOptions = { from: "user" };

void describe("performance CLI iterations option", () => {
    void it("parses positive iteration counts from strings", () => {
        const command = createPerformanceCommand();

        command.parse(["--iterations", "5"], USER_PARSE_OPTIONS);

        assert.equal(command.opts().iterations, 5);
    });

    void it("rejects non-positive iteration counts", () => {
        const command = createPerformanceCommand();

        assert.throws(
            () => command.parse(["--iterations", "0"], USER_PARSE_OPTIONS),
            (error) => {
                if (!(error instanceof Error)) {
                    return false;
                }
                const withCode = error as Error & { code?: string };
                assert.equal(withCode.code, "commander.invalidArgument");
                assert.match(error.message, /positive integer/i);
                return true;
            }
        );
    });
});
