import assert from "node:assert/strict";
import { test } from "node:test";

import {
    collectSuiteResults,
    resolveRequestedSuites
} from "../src/core/command-suite-helpers.js";
import type { SuiteRunner } from "../src/core/command-suite-helpers.js";
import { asErrorLike } from "../src/shared/error-guards.js";

test("collectSuiteResults executes suite runners with shared options", async () => {
    const calls = [];
    const runnerOptions = { iterations: 5 };
    const availableSuites: Map<string, SuiteRunner> =
        new Map<string, SuiteRunner>([
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
    const availableSuites: Map<string, SuiteRunner> =
        new Map<string, SuiteRunner>([
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
            const details = asErrorLike(error);
            const message = details?.message ?? "Unknown error";
            capturedErrors.push({ error, context });
            return { error: message, suite: context.suiteName };
        }
    });

    assert.deepStrictEqual(results.alpha, { error: "boom", suite: "alpha" });
    assert.deepStrictEqual(results.beta, { status: "ok" });
    assert.equal(capturedErrors.length, 1);
    const [capturedError] = capturedErrors;
    assert.equal(capturedError.context.suiteName, "alpha");
    const details = asErrorLike(capturedError.error);
    assert.ok(details);
    assert.equal(details.message, "boom");
});

test("collectSuiteResults normalizes errors when onError is not provided", async () => {
    const availableSuites: Map<string, SuiteRunner> =
        new Map<string, SuiteRunner>([
            [
                "alpha",
                () => {
                    const error: Error & { code?: string } = new Error("boom");
                    error.code = "ERR_TEST";
                    throw error;
                }
            ]
        ]);

    const results = await collectSuiteResults({
        suiteNames: ["alpha"],
        availableSuites
    });

    const alphaResult = results.alpha;
    assert.ok(alphaResult && typeof alphaResult === "object");
    const details = asErrorLike((alphaResult as { error?: unknown }).error);
    assert.ok(details);
    assert.equal(details.message, "boom");
    assert.equal(details.name, "Error");
    assert.equal(details.code, "ERR_TEST");
    assert.ok(Array.isArray(details.stack));
});

test("collectSuiteResults skips suites without registered runners", async () => {
    const availableSuites: Map<string, SuiteRunner> = new Map([
        ["alpha", () => ({ status: "ok" })]
    ]);

    const results = await collectSuiteResults({
        suiteNames: ["alpha", "missing"],
        availableSuites
    });

    assert.deepStrictEqual(results, { alpha: { status: "ok" } });
});

test("resolveRequestedSuites normalizes explicit suite selections", () => {
    const options = { suite: ["Alpha", "BETA"] };
    const suites: Map<string, SuiteRunner> = new Map([
        ["alpha", () => null],
        ["beta", () => null],
        ["gamma", () => null]
    ]);

    const requested = resolveRequestedSuites(options, suites);

    assert.deepStrictEqual(requested, ["alpha", "beta"]);
});

test("resolveRequestedSuites defaults to all available suites when unspecified", () => {
    const suites: Map<string, SuiteRunner> = new Map([
        ["alpha", () => null],
        ["beta", () => null]
    ]);

    const requested = resolveRequestedSuites({}, suites);

    assert.deepStrictEqual(requested, ["alpha", "beta"]);
});
