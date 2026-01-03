import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_MEMORY_REPORT_DIR,
    MEMORY_REPORT_DIRECTORY_ENV_VAR,
    applyMemoryReportDirectoryEnvOverride,
    getDefaultMemoryReportDirectory,
    resolveMemoryReportDirectory,
    setDefaultMemoryReportDirectory
} from "../src/modules/memory/index.js";

void describe("memory report directory configuration", () => {
    afterEach(() => {
        setDefaultMemoryReportDirectory(DEFAULT_MEMORY_REPORT_DIR);
        applyMemoryReportDirectoryEnvOverride({});
    });

    void it("returns the baseline default when no overrides are applied", () => {
        assert.equal(getDefaultMemoryReportDirectory(), DEFAULT_MEMORY_REPORT_DIR);
    });

    void it("allows overriding the default directory", () => {
        setDefaultMemoryReportDirectory("  output/reports  ");

        assert.equal(getDefaultMemoryReportDirectory(), "output/reports");
        assert.equal(resolveMemoryReportDirectory(), "output/reports");
    });

    void it("ignores blank overrides", () => {
        setDefaultMemoryReportDirectory("  ");

        assert.equal(getDefaultMemoryReportDirectory(), DEFAULT_MEMORY_REPORT_DIR);
    });

    void it("applies environment overrides to the default directory", () => {
        applyMemoryReportDirectoryEnvOverride({
            [MEMORY_REPORT_DIRECTORY_ENV_VAR]: "  env/reports  "
        });

        assert.equal(getDefaultMemoryReportDirectory(), "env/reports");
    });

    void it("resolves directory overrides with fallbacks", () => {
        setDefaultMemoryReportDirectory("results");

        assert.equal(resolveMemoryReportDirectory(), "results");
        assert.equal(resolveMemoryReportDirectory("  custom/output "), "custom/output");
        assert.equal(resolveMemoryReportDirectory(""), "results");
    });
});
