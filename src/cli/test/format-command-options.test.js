import assert from "node:assert/strict";
import { test } from "node:test";

import { collectFormatCommandOptions } from "../src/core/format-command-options.js";

const DEFAULTS = Object.freeze({
    defaultExtensions: Object.freeze([".gml"]),
    defaultParseErrorAction: "skip",
    defaultPrettierLogLevel: "warn"
});

test("collectFormatCommandOptions tolerates commands without option state", () => {
    let helpCalled = false;
    const command = {
        args: [],
        opts() {
            return;
        },
        helpInformation() {
            helpCalled = true;
            return "usage";
        }
    };

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.ok(helpCalled, "helpInformation should be consulted for usage text");
    assert.deepStrictEqual(result.targetPathInput, null);
    assert.strictEqual(result.targetPathProvided, false);
    assert.strictEqual(result.extensions, DEFAULTS.defaultExtensions);
    assert.strictEqual(
        result.prettierLogLevel,
        DEFAULTS.defaultPrettierLogLevel
    );
    assert.strictEqual(result.onParseError, DEFAULTS.defaultParseErrorAction);
    assert.strictEqual(result.checkMode, false);
    assert.strictEqual(result.skippedDirectorySampleLimit, undefined);
    assert.strictEqual(result.ignoredFileSampleLimit, undefined);
    assert.strictEqual(result.unsupportedExtensionSampleLimit, undefined);
    assert.strictEqual(result.usage, "usage");
});
