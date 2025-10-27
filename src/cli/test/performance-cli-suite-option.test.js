import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPerformanceCommand } from "../src/modules/performance/index.js";
import {
    PerformanceSuiteName,
    formatPerformanceSuiteList
} from "../src/modules/performance/suite-options.js";

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

    it("documents available suites in the help output", () => {
        const command = createPerformanceCommand();
        const help = command.helpInformation();
        const suiteList = formatPerformanceSuiteList();

        assert.match(
            help,
            new RegExp(
                `Available suites:\\s*${suiteList
                    .split(", ")
                    .map((entry) => entry.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
                    .join("\\s*,\\s*")}`
            ),
            "Expected performance help to list available suites"
        );
        assert.match(
            help,
            /Defaults to all suites when\s+omitted\./,
            "Expected performance help to describe default suite selection"
        );
        assert.ok(
            help.includes("(default: all available suites)"),
            "Expected performance help to surface the human-friendly default"
        );
    });
});
