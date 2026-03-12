import assert from "node:assert/strict";
import { test } from "node:test";

import { assertEquals, assertNotEquals } from "./assertions.js";

void test("assertEquals ignores whitespace and newline differences for strings", () => {
    assert.doesNotThrow(() => {
        assertEquals("foo(\n    bar  );\n", "foo(bar);");
    });
});

void test("assertNotEquals compares normalized string content", () => {
    assert.doesNotThrow(() => {
        assertNotEquals("foo(bar);", "foo(baz);");
    });
});
