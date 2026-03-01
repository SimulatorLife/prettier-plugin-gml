import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("keeps new call arguments inline when callback bodies expand", async () => {
    const source = [
        "collider = new ColmeshColliderCapsule(x, y, z, 0, 0, 1, radius, radius * 2, 0, function (o) {",
        "if (instance_exists(o)) {",
        "instance_destroy();",
        "}",
        "});",
        ""
    ].join("\n");

    const formatted = await Format.format(source, { printWidth: 106, logicalOperatorsStyle: "symbols" });
    const lines = formatted.split("\n");

    assert.strictEqual(
        lines[0],
        "collider = new ColmeshColliderCapsule(x, y, z, 0, 0, 1, radius, radius * 2, 0, function (o) {",
        "Expected constructor call arguments to remain inline when a trailing callback expands."
    );
});
