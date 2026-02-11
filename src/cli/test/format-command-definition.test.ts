import assert from "node:assert/strict";
import { test } from "node:test";

import { collectFormatCommandOptions } from "../src/cli-core/format-command-options.js";
import { createFormatCommand } from "../src/commands/format.js";

const DEFAULTS = Object.freeze({
    defaultExtensions: Object.freeze([".gml"]),
    defaultParseErrorAction: "abort",
    defaultPrettierLogLevel: "warn"
});

void test("createFormatCommand accepts space-separated --extensions values", () => {
    const command = createFormatCommand();
    command.parse(["node", "prettier-plugin-gml", "--extensions", ".gml", ".yy"], { from: "node" });

    const options = collectFormatCommandOptions(command, DEFAULTS);

    assert.deepStrictEqual(options.extensions, [".gml", ".yy"]);
});

void test("createFormatCommand help documents variadic extension input", () => {
    const command = createFormatCommand();

    const helpText = command.helpInformation();

    assert.match(helpText, /--extensions <extensions\.\.\.>/);
    assert.match(helpText, /space-separated, repeated, or comma-separated values/);
});
