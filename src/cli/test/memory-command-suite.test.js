import assert from "node:assert/strict";
import test from "node:test";

import {
    createMemoryCommand,
    MemorySuiteName,
    formatMemorySuiteNameList
} from "../src/commands/memory/index.js";

const USER_PARSE_OPTIONS = { from: "user" };

test("memory command accepts known suite names", () => {
    const command = createMemoryCommand({ env: {} });

    command.parse(
        ["--suite", MemorySuiteName.PLUGIN_FORMAT],
        USER_PARSE_OPTIONS
    );

    assert.deepStrictEqual(command.opts().suite, [
        MemorySuiteName.PLUGIN_FORMAT
    ]);
});

test("memory command normalizes suite names", () => {
    const command = createMemoryCommand({ env: {} });

    command.parse(["--suite", "Parser-Ast"], USER_PARSE_OPTIONS);

    assert.deepStrictEqual(command.opts().suite, [MemorySuiteName.PARSER_AST]);
});

test("memory command rejects unknown suite names", () => {
    const command = createMemoryCommand({ env: {} });

    assert.throws(
        () => command.parse(["--suite", "invalid-suite"], USER_PARSE_OPTIONS),
        (error) => {
            assert.equal(error?.code, "commander.invalidArgument");
            assert.match(error.message, /memory suite must be one of/i);
            for (const name of formatMemorySuiteNameList().split(/,\s*/)) {
                assert.match(error.message, new RegExp(name));
            }
            return true;
        }
    );
});
