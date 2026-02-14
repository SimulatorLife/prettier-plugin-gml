import assert from "node:assert/strict";
import { test } from "node:test";

import { Lint } from "../src/index.js";

type ParseSuccess = {
    ok: true;
    ast: {
        comments?: Array<{ range?: [number, number] }>;
        tokens?: Array<{ range?: [number, number] }>;
        body?: Array<{ arguments?: Array<{ range?: [number, number] }> }>;
    };
    parserServices: {
        gml: {
            filePath: string;
            recovery: Array<{ kind: string; originalOffset: number }>;
            directives: Array<string>;
            enums: Array<string>;
        };
    };
};

type ParseFailure = {
    ok: false;
    errors: ReadonlyArray<{ message: string; line: number; column: number }>;
};

function parseWithOptions(sourceText: string, recovery: "none" | "limited"): ParseSuccess | ParseFailure {
    const language = Lint.plugin.languages.gml as {
        parse: (
            file: { text: string; filePath: string },
            context: { languageOptions: { recovery: "none" | "limited" } }
        ) => ParseSuccess | ParseFailure;
    };

    return language.parse(
        {
            text: sourceText,
            filePath: "./test.gml"
        },
        {
            languageOptions: { recovery }
        }
    );
}

test("language parse returns ESLint v9 parse channel with ok discriminator", () => {
    const result = parseWithOptions("var x = 1;", "limited");
    assert.equal(result.ok, true);
});

test("strict parse fails while limited recovery succeeds for missing argument separators", () => {
    const strictResult = parseWithOptions("show_debug_message(1 2);", "none");
    assert.equal(strictResult.ok, false);

    const limitedResult = parseWithOptions("show_debug_message(1 2);", "limited");
    assert.equal(limitedResult.ok, true);

    if (!limitedResult.ok) {
        assert.fail("Expected limited recovery parse success.");
    }

    assert.equal(limitedResult.parserServices.gml.recovery.length, 1);
    assert.equal(limitedResult.parserServices.gml.recovery[0]?.kind, "inserted-argument-separator");

    const recoveredArgumentRange = limitedResult.ast.body?.[0]?.arguments?.[1]?.range;
    assert.deepEqual(recoveredArgumentRange, [21, 22]);
});

test("limited recovery preserves projected substring invariants for argument ranges", () => {
    const source = "show_debug_message(10 20);";
    const result = parseWithOptions(source, "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected limited recovery parse success.");
    }

    const secondArgumentRange = result.ast.body?.[0]?.arguments?.[1]?.range;
    assert.ok(Array.isArray(secondArgumentRange));

    const [start, end] = secondArgumentRange;
    assert.equal(source.slice(start, end), "20");
    assert.equal(result.parserServices.gml.recovery[0]?.originalOffset, 21);
});

test("parser services contract always shapes canonical path, directives, enums, and recovery", () => {
    const result = parseWithOptions("var x = 1;", "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected parse success.");
    }

    assert.equal(typeof result.parserServices.gml.filePath, "string");
    assert.ok(result.parserServices.gml.filePath.endsWith("test.gml"));
    assert.deepEqual(result.parserServices.gml.directives, []);
    assert.deepEqual(result.parserServices.gml.enums, []);
    assert.deepEqual(result.parserServices.gml.recovery, []);
});

test("utf-16 range projection stays aligned after limited recovery", () => {
    const source = 'show_debug_message("😀" 2);';
    const result = parseWithOptions(source, "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected parse success.");
    }

    const firstArgumentRange = result.ast.body?.[0]?.arguments?.[0]?.range;
    assert.deepEqual(firstArgumentRange, [19, 23]);
    assert.equal(source.slice(19, 23), '"😀"');

    const secondArgumentRange = result.ast.body?.[0]?.arguments?.[1]?.range;
    assert.deepEqual(secondArgumentRange, [24, 25]);
    assert.equal(source.slice(24, 25), "2");
});

test("tokenization source remains original source under limited recovery", () => {
    const source = "show_debug_message(1 2); // tail";
    const result = parseWithOptions(source, "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected parse success.");
    }

    for (const token of result.ast.tokens ?? []) {
        if (!Array.isArray(token.range)) {
            continue;
        }

        const [start, end] = token.range;
        assert.ok(start >= 0);
        assert.ok(end <= source.length);
        assert.ok(start <= end);
    }

    for (const comment of result.ast.comments ?? []) {
        if (!Array.isArray(comment.range)) {
            continue;
        }

        const [start, end] = comment.range;
        assert.equal(source.slice(start, end).startsWith("//"), true);
    }
});
