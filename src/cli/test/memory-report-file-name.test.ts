import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_MEMORY_REPORT_FILENAME,
    MEMORY_REPORT_FILENAME_ENV_VAR,
    applyMemoryReportFileNameEnvOverride,
    getDefaultMemoryReportFileName,
    resolveMemoryReportFileName,
    setDefaultMemoryReportFileName
} from "../src/modules/memory/index.js";

void describe("memory report file name configuration", () => {
    afterEach(() => {
        setDefaultMemoryReportFileName(DEFAULT_MEMORY_REPORT_FILENAME);
        applyMemoryReportFileNameEnvOverride({});
    });

    void it("returns the baseline default when no overrides are applied", () => {
        assert.equal(getDefaultMemoryReportFileName(), DEFAULT_MEMORY_REPORT_FILENAME);
    });

    void it("allows overriding the default file name", () => {
        setDefaultMemoryReportFileName("  output.json  ");

        assert.equal(getDefaultMemoryReportFileName(), "output.json");
        assert.equal(resolveMemoryReportFileName(), "output.json");
    });

    void it("ignores blank overrides", () => {
        setDefaultMemoryReportFileName("  ");

        assert.equal(getDefaultMemoryReportFileName(), DEFAULT_MEMORY_REPORT_FILENAME);
    });

    void it("applies environment overrides to the default file name", () => {
        applyMemoryReportFileNameEnvOverride({
            [MEMORY_REPORT_FILENAME_ENV_VAR]: "  env-report.json  "
        });

        assert.equal(getDefaultMemoryReportFileName(), "env-report.json");
    });

    void it("resolves file name overrides with fallbacks", () => {
        setDefaultMemoryReportFileName("baseline.json");

        assert.equal(resolveMemoryReportFileName(), "baseline.json");
        assert.equal(resolveMemoryReportFileName(" custom-output.json  "), "custom-output.json");
        assert.equal(resolveMemoryReportFileName(""), "baseline.json");
    });
});
