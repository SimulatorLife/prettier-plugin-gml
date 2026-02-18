import assert from "node:assert/strict";
import { test } from "node:test";

import { createFormatCommand } from "../src/commands/format.js";

void test("createFormatCommand only targets .gml files and does not expose extension overrides", () => {
    const command = createFormatCommand();
    const hasExtensionsOption = command.options.some((option) => option.long === "--extensions");
    assert.equal(hasExtensionsOption, false);
});

void test("createFormatCommand help no longer documents extension overrides", () => {
    const command = createFormatCommand();

    const helpText = command.helpInformation();

    assert.doesNotMatch(helpText, /--extensions/);
});
