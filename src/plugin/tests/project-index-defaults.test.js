import assert from "node:assert/strict";
import test from "node:test";

import {
    getDefaultProjectIndexGmlConcurrency,
    setDefaultProjectIndexGmlConcurrency,
    PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE
} from "../src/project-index/concurrency.js";

test("project index concurrency default can be tuned programmatically", () => {
    const originalDefault = getDefaultProjectIndexGmlConcurrency();
    const baseline = setDefaultProjectIndexGmlConcurrency(
        PROJECT_INDEX_GML_CONCURRENCY_BASELINE
    );

    try {
        assert.equal(baseline, PROJECT_INDEX_GML_CONCURRENCY_BASELINE);

        const configured = setDefaultProjectIndexGmlConcurrency("6");
        assert.equal(configured, 6);
        assert.equal(getDefaultProjectIndexGmlConcurrency(), 6);

        const capped = setDefaultProjectIndexGmlConcurrency(128);
        assert.equal(capped, 16);

        const floored = setDefaultProjectIndexGmlConcurrency(0);
        assert.equal(floored, 1);

        const reset = setDefaultProjectIndexGmlConcurrency("not-a-number");
        assert.equal(reset, baseline);
        assert.equal(getDefaultProjectIndexGmlConcurrency(), baseline);
    } finally {
        setDefaultProjectIndexGmlConcurrency(originalDefault);
    }
});

test("invalid environment overrides fall back to the baseline", () => {
    const originalDefault = getDefaultProjectIndexGmlConcurrency();

    try {
        // Simulate the environment override hook by calling the setter directly
        // with the same value that would have been provided from process.env.
        setDefaultProjectIndexGmlConcurrency("\t 12 \n");
        assert.equal(getDefaultProjectIndexGmlConcurrency(), 12);

        setDefaultProjectIndexGmlConcurrency("");
        assert.equal(
            getDefaultProjectIndexGmlConcurrency(),
            PROJECT_INDEX_GML_CONCURRENCY_BASELINE
        );

        setDefaultProjectIndexGmlConcurrency(null);
        assert.equal(
            getDefaultProjectIndexGmlConcurrency(),
            PROJECT_INDEX_GML_CONCURRENCY_BASELINE
        );
    } finally {
        setDefaultProjectIndexGmlConcurrency(originalDefault);
    }
});

// Ensure the exported environment variable aligns with the documented name.
test("project index concurrency env var name is stable", () => {
    assert.equal(
        PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
        "GML_PROJECT_INDEX_CONCURRENCY"
    );
});
