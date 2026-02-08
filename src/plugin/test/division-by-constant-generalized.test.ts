import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("converts division by 2 to multiplication by 0.5", async () => {
    const source = "var result = value / 2;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.ok(
        formatted.includes("var result = value * 0.5;"),
        "Expected division by 2 to become multiplication by 0.5"
    );
});

void test("converts division by 4 to multiplication by 0.25", async () => {
    const source = "var result = value / 4;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.ok(
        formatted.includes("var result = value * 0.25;"),
        "Expected division by 4 to become multiplication by 0.25"
    );
});

void test("converts division by 5 to multiplication by 0.2", async () => {
    const source = "var result = value / 5;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.ok(
        formatted.includes("var result = value * 0.2;"),
        "Expected division by 5 to become multiplication by 0.2"
    );
});

void test("converts division by 10 to multiplication by 0.1", async () => {
    const source = "var result = value / 10;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.ok(
        formatted.includes("var result = value * 0.1;"),
        "Expected division by 10 to become multiplication by 0.1"
    );
});

void test("converts division by 3 to multiplication by reciprocal", async () => {
    const source = "var result = value / 3;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    const reciprocal = 1 / 3;
    assert.ok(
        formatted.includes(`var result = value * ${reciprocal};`),
        `Expected division by 3 to become multiplication by ${reciprocal}`
    );
});

void test("converts division by 8 to multiplication by 0.125", async () => {
    const source = "var result = value / 8;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.ok(
        formatted.includes("var result = value * 0.125;"),
        "Expected division by 8 to become multiplication by 0.125"
    );
});

void test("converts division by decimal constant", async () => {
    const source = "var result = value / 2.5;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.ok(
        formatted.includes("var result = value * 0.4;"),
        "Expected division by 2.5 to become multiplication by 0.4"
    );
});

void test("preserves division when divisor is zero", async () => {
    const source = "var result = value / 0;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.ok(formatted.includes("var result = value / 0;"), "Expected division by zero to remain unchanged");
});

void test("preserves division when divisor is not a literal", async () => {
    const source = "var result = value / variable;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.ok(
        formatted.includes("var result = value / variable;"),
        "Expected division by variable to remain unchanged"
    );
});

void test("does not convert division when optimizeMathExpressions is false", async () => {
    const source = "var result = value / 2;";

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: false
    });

    assert.ok(
        formatted.includes("var result = value / 2;"),
        "Expected division to remain unchanged when optimizeMathExpressions is false"
    );
});
