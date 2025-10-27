import assert from "node:assert/strict";
import { test } from "node:test";

import {
    collectSuiteResults,
    resolveRequestedSuites
} from "../src/core/command-suite-helpers.js";

test("collectSuiteResults executes suite runners with shared options", async () => {
    const calls = [];
    const runnerOptions = { iterations: 5 };
    const availableSuites = new Map([
        [
            "alpha",
            async (options) => {
                calls.push(["alpha", options]);
                return { label: "alpha", options };
            }
        ],
        [
            "beta",
            (options) => {
                calls.push(["beta", options]);
                return { label: "beta", options };
            }
        ]
    ]);

    const results = await collectSuiteResults({
        suiteNames: ["alpha", "beta"],
        availableSuites,
        runnerOptions
    });

    assert.deepStrictEqual(results, {
        alpha: { label: "alpha", options: runnerOptions },
        beta: { label: "beta", options: runnerOptions }
    });
    assert.deepStrictEqual(calls, [
        ["alpha", runnerOptions],
        ["beta", runnerOptions]
    ]);
});

test("collectSuiteResults maps thrown errors using onError callback", async () => {
    const availableSuites = new Map([
        [
            "alpha",
            () => {
                throw new Error("boom");
            }
        ],
        ["beta", () => ({ status: "ok" })]
    ]);

    const capturedErrors = [];
    const results = await collectSuiteResults({
        suiteNames: ["alpha", "beta"],
        availableSuites,
        onError: (error, context) => {
            capturedErrors.push({ error, context });
            return { error: error.message, suite: context.suiteName };
        }
    });

    assert.deepStrictEqual(results.alpha, { error: "boom", suite: "alpha" });
    assert.deepStrictEqual(results.beta, { status: "ok" });
    assert.equal(capturedErrors.length, 1);
    assert.equal(capturedErrors[0].context.suiteName, "alpha");
    assert.equal(capturedErrors[0].error.message, "boom");
});

test("collectSuiteResults normalizes errors when onError is not provided", async () => {
    const availableSuites = new Map([
        [
            "alpha",
            () => {
                const error = new Error("boom");
                error.code = "ERR_TEST";
                throw error;
            }
        ]
    ]);

    const results = await collectSuiteResults({
        suiteNames: ["alpha"],
        availableSuites
    });

    assert.equal(results.alpha.error.message, "boom");
    assert.equal(results.alpha.error.name, "Error");
    assert.equal(results.alpha.error.code, "ERR_TEST");
    assert.ok(Array.isArray(results.alpha.error.stack));
});

test("collectSuiteResults skips suites without registered runners", async () => {
    const availableSuites = new Map([["alpha", () => ({ status: "ok" })]]);

    const results = await collectSuiteResults({
        suiteNames: ["alpha", "missing"],
        availableSuites
    });

    assert.deepStrictEqual(results, { alpha: { status: "ok" } });
});

test("resolveRequestedSuites normalizes explicit suite selections", () => {
    const options = { suite: ["Alpha", "BETA"] };
    const suites = new Map([
        ["alpha", {}],
        ["beta", {}],
        ["gamma", {}]
    ]);

    const requested = resolveRequestedSuites(options, suites);

    assert.deepStrictEqual(requested, ["alpha", "beta"]);
});

test("resolveRequestedSuites defaults to all available suites when unspecified", () => {
    const suites = new Map([
        ["alpha", {}],
        ["beta", {}]
    ]);

    const requested = resolveRequestedSuites({}, suites);

    assert.deepStrictEqual(requested, ["alpha", "beta"]);
});
