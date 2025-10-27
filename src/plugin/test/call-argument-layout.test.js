import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });
}

test("breaks simple prefix arguments when callbacks follow", async () => {
    const source = [
        "function demo() {",
        "    call_later(",
        "        1800,",
        "        time_source_units_frames,",
        "        function() {",
        "            perform_cleanup();",
        "        },",
        "        true",
        "    );",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const callStart = formatted.indexOf("call_later(");

    assert.notEqual(
        callStart,
        -1,
        "Expected formatted output to contain the call expression."
    );

    const callBody = formatted.slice(callStart).split(");")[0];
    const lines = callBody.split("\n");

    assert.equal(
        lines[1].trim(),
        "1800,",
        "Expected the first numeric argument to be on its own line."
    );
    assert.equal(
        lines[2].trim(),
        "time_source_units_frames,",
        "Expected the time unit argument to remain on a dedicated line."
    );
    assert.ok(
        !lines[1].includes("time_source_units_frames"),
        "Expected the first and second arguments to be separated by a line break."
    );
});
