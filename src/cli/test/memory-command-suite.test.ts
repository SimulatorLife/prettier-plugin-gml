import assert from "node:assert/strict";
import test from "node:test";

import {
    createMemoryCommand,
    MemorySuiteName,
    formatMemorySuiteNameList
} from "../src/modules/memory/index.js";
import type { ParseOptions } from "commander";

const USER_PARSE_OPTIONS: ParseOptions = { from: "user" };

void test("memory command accepts known suite names", () => {
    const command = createMemoryCommand({ env: {} });

    command.parse(
        ["--suite", MemorySuiteName.PLUGIN_FORMAT],
        USER_PARSE_OPTIONS
    );

    assert.deepStrictEqual(command.opts().suite, [
        MemorySuiteName.PLUGIN_FORMAT
    ]);
});

void test("memory command normalizes suite names", () => {
    const command = createMemoryCommand({ env: {} });

    command.parse(["--suite", "Parser-Ast"], USER_PARSE_OPTIONS);

    assert.deepStrictEqual(command.opts().suite, [MemorySuiteName.PARSER_AST]);
});

void test("memory command rejects unknown suite names", () => {
    const command = createMemoryCommand({ env: {} });

    assert.throws(
        () => command.parse(["--suite", "invalid-suite"], USER_PARSE_OPTIONS),
        (error) => {
            if (!(error instanceof Error)) {
                return false;
            }
            // Commander sets code on its error instances.
            assert.equal(
                (error as Error & { code?: string }).code,
                "commander.invalidArgument"
            );
            assert.match(error.message, /memory suite must be one of/i);
            for (const name of formatMemorySuiteNameList().split(/,\s*/)) {
                assert.match(error.message, new RegExp(name));
            }
            return true;
        }
    );
});

void test("memory command accepts the common node limit option", () => {
    const command = createMemoryCommand({ env: {} });

    command.parse(["--common-node-limit", "7"], USER_PARSE_OPTIONS);

    assert.equal(command.opts().commonNodeLimit, 7);
});

void test("memory command rejects invalid common node limits", () => {
    const command = createMemoryCommand({ env: {} });

    assert.throws(
        () => command.parse(["--common-node-limit", "0"], USER_PARSE_OPTIONS),
        (error) => {
            if (!(error instanceof Error)) {
                return false;
            }
            const withCode = error as Error & { code?: string };
            assert.equal(withCode.code, "commander.invalidArgument");
            assert.match(
                error.message,
                /common node type limit must be a positive integer/i
            );
            return true;
        }
    );
});
