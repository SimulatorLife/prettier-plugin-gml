import assert from "node:assert/strict";
import { test } from "node:test";

import { collectFormatCommandOptions } from "../src/cli-core/format-command-options.js";
import type { CommanderCommandLike } from "../src/cli-core/commander-types.js";

const DEFAULTS = Object.freeze({
    defaultExtensions: Object.freeze([".gml"]),
    defaultParseErrorAction: "skip",
    defaultPrettierLogLevel: "warn"
});

function createStubCommand({
    args = [],
    opts = () => ({}),
    helpInformation = () => "usage"
}: {
    args?: Array<string>;
    opts?: () => Record<string, unknown>;
    helpInformation?: () => string;
}): CommanderCommandLike {
    return {
        args,
        opts,
        helpInformation
    };
}

void test("collectFormatCommandOptions tolerates commands without option state", () => {
    let helpCalled = false;
    const command = createStubCommand({
        opts: () => ({}),
        helpInformation() {
            helpCalled = true;
            return "usage";
        }
    });

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.ok(helpCalled, "helpInformation should be consulted for usage text");
    assert.deepStrictEqual(result.targetPathInput, null);
    assert.strictEqual(result.targetPathProvided, false);
    assert.deepStrictEqual(result.extensions, DEFAULTS.defaultExtensions);
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

void test("collectFormatCommandOptions normalizes string extension lists", () => {
    const command = createStubCommand({
        opts: () => ({ extensions: ".yy" })
    });

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.deepStrictEqual(result.extensions, [".yy"]);
});

void test("collectFormatCommandOptions splits delimited extension strings", () => {
    const command = createStubCommand({
        opts: () => ({ extensions: ".gml,.yy" })
    });

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.deepStrictEqual(result.extensions, [".gml", ".yy"]);
});

void test("collectFormatCommandOptions accepts iterable extension collections", () => {
    const extensions = new Set([".yy", ".gml", ".yy"]);
    const command = createStubCommand({
        opts: () => ({ extensions })
    });

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.deepStrictEqual(result.extensions, [".yy", ".gml"]);
});

void test("collectFormatCommandOptions derives target path from --path option", () => {
    const command = createStubCommand({
        args: ["ignored"],
        opts: () => ({ path: " ./project  " })
    });

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.strictEqual(result.targetPathInput, "./project");
    assert.strictEqual(result.targetPathProvided, true);
    assert.strictEqual(result.rawTargetPathInput, " ./project  ");
});

void test("collectFormatCommandOptions treats blank --path as provided but empty", () => {
    const command = createStubCommand({
        args: ["ignored"],
        opts: () => ({ path: "   " })
    });

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.strictEqual(result.targetPathInput, null);
    assert.strictEqual(result.targetPathProvided, true);
});

void test("collectFormatCommandOptions falls back to positional target", () => {
    const command = createStubCommand({
        args: [" ./script.gml  "],
        opts: () => ({})
    });

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.strictEqual(result.targetPathInput, "./script.gml");
    assert.strictEqual(result.targetPathProvided, true);
});

void test("collectFormatCommandOptions honours ignored directory samples alias", () => {
    const command = createStubCommand({
        opts: () => ({
            ignoredDirectorySampleLimit: 5,
            ignoredDirectorySamples: 2
        })
    });

    const result = collectFormatCommandOptions(command, DEFAULTS);

    assert.strictEqual(result.skippedDirectorySampleLimit, 2);
});
