import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPerformanceCommand } from "../src/commands/performance/index.js";
import { PerformanceSuiteName } from "../src/commands/performance/suite-options.js";

describe("performance CLI suite option", () => {
    it("accepts known suite names", () => {
        const command = createPerformanceCommand();

        command.parse(
            [
                "--suite",
                PerformanceSuiteName.PARSER,
                "--suite",
                PerformanceSuiteName.FORMATTER
            ],
            { from: "user" }
        );

        assert.deepStrictEqual(command.opts().suite, [
            PerformanceSuiteName.PARSER,
            PerformanceSuiteName.FORMATTER
        ]);
    });

    it("rejects unknown suite names", () => {
        const command = createPerformanceCommand();

        assert.throws(
            () =>
                command.parse(["--suite", "unsupported"], {
                    from: "user"
                }),
            (error) => {
                assert.equal(error?.code, "commander.invalidArgument");
                assert.match(error.message, /benchmark suite must be one of/i);
                return true;
            }
        );
    });
});
