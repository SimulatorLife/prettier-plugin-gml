import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_MEMORY_REPORT_DIR,
    MEMORY_REPORT_DIRECTORY_ENV_VAR,
    applyMemoryReportDirectoryEnvOverride,
    getDefaultMemoryReportDirectory,
    resolveMemoryReportDirectory,
    setDefaultMemoryReportDirectory
} from "../src/commands/memory/index.js";

describe("memory report directory configuration", () => {
    afterEach(() => {
        setDefaultMemoryReportDirectory(DEFAULT_MEMORY_REPORT_DIR);
        applyMemoryReportDirectoryEnvOverride({});
    });

    it("returns the baseline default when no overrides are applied", () => {
        assert.equal(
            getDefaultMemoryReportDirectory(),
            DEFAULT_MEMORY_REPORT_DIR
        );
    });

    it("allows overriding the default directory", () => {
        setDefaultMemoryReportDirectory("  output/reports  ");

        assert.equal(getDefaultMemoryReportDirectory(), "output/reports");
        assert.equal(resolveMemoryReportDirectory(), "output/reports");
    });

    it("ignores blank overrides", () => {
        setDefaultMemoryReportDirectory("  ");

        assert.equal(
            getDefaultMemoryReportDirectory(),
            DEFAULT_MEMORY_REPORT_DIR
        );
    });

    it("applies environment overrides to the default directory", () => {
        applyMemoryReportDirectoryEnvOverride({
            [MEMORY_REPORT_DIRECTORY_ENV_VAR]: "  env/reports  "
        });

        assert.equal(getDefaultMemoryReportDirectory(), "env/reports");
    });

    it("resolves directory overrides with fallbacks", () => {
        setDefaultMemoryReportDirectory("results");

        assert.equal(resolveMemoryReportDirectory(), "results");
        assert.equal(
            resolveMemoryReportDirectory("  custom/output "),
            "custom/output"
        );
        assert.equal(resolveMemoryReportDirectory(""), "results");
    });
});
