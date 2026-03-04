import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("prints switch comments immediately after a multi-line opening brace", async () => {
    const source = [
        "function f() {",
        "    switch (",
        "        a",
        "    ) {// --------------------------------------------------------------",
        '        case ".obj":',
        "            break;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);

    assert.equal(
        formatted,
        [
            "function f() {",
            "    switch (a) { // --------------------------------------------------------------",
            '        case ".obj":',
            "            break;",
            "    }",
            "}",
            ""
        ].join("\n")
    );
});

void test("prints trailing break comments inside switch cases", async () => {
    const source = [
        "function f() {",
        "    switch (a) {",
        '        case ".obj":',
        "            break;// --------------------------------------------------------------",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);

    assert.equal(
        formatted,
        [
            "function f() {",
            "    switch (a) {",
            '        case ".obj":',
            "            break; // --------------------------------------------------------------",
            "    }",
            "}",
            ""
        ].join("\n")
    );
});
