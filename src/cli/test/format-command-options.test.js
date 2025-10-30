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

test("collectFormatCommandOptions normalizes string extension lists", () => {
    const command = {
        args: [],
        opts() {
            return { extensions: ".yy" };
        },
        helpInformation() {
            return "usage";
        }
    };

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.deepStrictEqual(result.extensions, [".yy"]);
});

test("collectFormatCommandOptions splits delimited extension strings", () => {
    const command = {
        args: [],
        opts() {
            return { extensions: ".gml,.yy" };
        },
        helpInformation() {
            return "usage";
        }
    };

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.deepStrictEqual(result.extensions, [".gml", ".yy"]);
});

test("collectFormatCommandOptions derives target path from --path option", () => {
    const command = {
        args: ["ignored"],
        opts() {
            return { path: " ./project  " };
        },
        helpInformation() {
            return "usage";
        }
    };

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.strictEqual(result.targetPathInput, "./project");
    assert.strictEqual(result.targetPathProvided, true);
});

test("collectFormatCommandOptions treats blank --path as provided but empty", () => {
    const command = {
        args: ["ignored"],
        opts() {
            return { path: "   " };
        },
        helpInformation() {
            return "usage";
        }
    };

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.strictEqual(result.targetPathInput, null);
    assert.strictEqual(result.targetPathProvided, true);
});

test("collectFormatCommandOptions falls back to positional target", () => {
    const command = {
        args: [" ./script.gml  "],
        opts() {
            return {};
        },
        helpInformation() {
            return "usage";
        }
    };

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.strictEqual(result.targetPathInput, "./script.gml");
    assert.strictEqual(result.targetPathProvided, true);
});

test("collectFormatCommandOptions honours ignored directory samples alias", () => {
    const command = {
        args: [],
        opts() {
            return {
                ignoredDirectorySampleLimit: 5,
                ignoredDirectorySamples: 2
            };
        },
        helpInformation() {
            return "usage";
        }
    };

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.strictEqual(result.skippedDirectorySampleLimit, 2);
});
