import { strictEqual } from "node:assert";
import { test } from "node:test";

import { Core } from "../../index.js";

// Tests for isIdentifierLike
void test("isIdentifierLike accepts valid JavaScript identifiers", () => {
    strictEqual(Core.isIdentifierLike("foo"), true);
    strictEqual(Core.isIdentifierLike("bar123"), true);
    strictEqual(Core.isIdentifierLike("_private"), true);
    strictEqual(Core.isIdentifierLike("$jquery"), true);
    strictEqual(Core.isIdentifierLike("CamelCase"), true);
    strictEqual(Core.isIdentifierLike("snake_case"), true);
    strictEqual(Core.isIdentifierLike("CONSTANT"), true);
});

void test("isIdentifierLike rejects invalid identifiers starting with digits", () => {
    strictEqual(Core.isIdentifierLike("123abc"), false);
    strictEqual(Core.isIdentifierLike("0foo"), false);
});

void test("isIdentifierLike rejects identifiers with special characters", () => {
    strictEqual(Core.isIdentifierLike("my-var"), false);
    strictEqual(Core.isIdentifierLike("hello.world"), false);
    strictEqual(Core.isIdentifierLike("foo bar"), false);
    strictEqual(Core.isIdentifierLike("foo@bar"), false);
    strictEqual(Core.isIdentifierLike("a+b"), false);
});

void test("isIdentifierLike rejects empty string", () => {
    strictEqual(Core.isIdentifierLike(""), false);
});

void test("isIdentifierLike accepts single character identifiers", () => {
    strictEqual(Core.isIdentifierLike("x"), true);
    strictEqual(Core.isIdentifierLike("_"), true);
    strictEqual(Core.isIdentifierLike("$"), true);
});

// Tests for escapeTemplateText
void test("escapeTemplateText leaves plain text unchanged", () => {
    strictEqual(Core.escapeTemplateText("hello world"), "hello world");
    strictEqual(Core.escapeTemplateText("simple text"), "simple text");
    strictEqual(Core.escapeTemplateText(""), "");
});

void test("escapeTemplateText escapes backticks", () => {
    strictEqual(Core.escapeTemplateText("hello `world`"), "hello \\`world\\`");
    strictEqual(Core.escapeTemplateText("`quoted`"), "\\`quoted\\`");
    strictEqual(Core.escapeTemplateText("multiple ` backticks ` here"), "multiple \\` backticks \\` here");
});

void test("escapeTemplateText escapes template interpolation syntax", () => {
    strictEqual(Core.escapeTemplateText("cost: ${price}"), "cost: \\${price}");
    strictEqual(Core.escapeTemplateText("${foo} and ${bar}"), "\\${foo} and \\${bar}");
    strictEqual(Core.escapeTemplateText("value is ${x}"), "value is \\${x}");
});

void test("escapeTemplateText escapes both backticks and interpolation", () => {
    strictEqual(Core.escapeTemplateText("`template ${expr}`"), "\\`template \\${expr}\\`");
    strictEqual(Core.escapeTemplateText("${a} `mixed` ${b}"), "\\${a} \\`mixed\\` \\${b}");
});

// Tests for normalizeStructKeyText
void test("normalizeStructKeyText removes double quotes from quoted strings", () => {
    strictEqual(Core.normalizeStructKeyText('"hello"'), "hello");
    strictEqual(Core.normalizeStructKeyText('"world"'), "world");
    strictEqual(Core.normalizeStructKeyText('""'), "");
});

void test("normalizeStructKeyText removes single quotes from quoted strings", () => {
    strictEqual(Core.normalizeStructKeyText("'hello'"), "hello");
    strictEqual(Core.normalizeStructKeyText("'world'"), "world");
    strictEqual(Core.normalizeStructKeyText("''"), "");
});

void test("normalizeStructKeyText handles JSON escape sequences in double quotes", () => {
    strictEqual(Core.normalizeStructKeyText(String.raw`"hello\nworld"`), "hello\nworld");
    strictEqual(Core.normalizeStructKeyText(String.raw`"tab\there"`), "tab\there");
    strictEqual(Core.normalizeStructKeyText(String.raw`"quote: \"test\""`), 'quote: "test"');
});

void test("normalizeStructKeyText returns unquoted strings unchanged", () => {
    strictEqual(Core.normalizeStructKeyText("unquoted"), "unquoted");
    strictEqual(Core.normalizeStructKeyText("my_identifier"), "my_identifier");
    strictEqual(Core.normalizeStructKeyText("123"), "123");
});

void test("normalizeStructKeyText returns mismatched quotes unchanged", () => {
    strictEqual(Core.normalizeStructKeyText("\"mixed'"), "\"mixed'");
    strictEqual(Core.normalizeStructKeyText("'\"wrong"), "'\"wrong");
});

void test("normalizeStructKeyText handles single characters", () => {
    strictEqual(Core.normalizeStructKeyText('"a"'), "a");
    strictEqual(Core.normalizeStructKeyText("'x'"), "x");
    strictEqual(Core.normalizeStructKeyText("a"), "a");
});

void test("normalizeStructKeyText handles strings shorter than 2 characters", () => {
    strictEqual(Core.normalizeStructKeyText('"'), '"');
    strictEqual(Core.normalizeStructKeyText("'"), "'");
    strictEqual(Core.normalizeStructKeyText(""), "");
});

void test("normalizeStructKeyText handles malformed JSON gracefully", () => {
    // Invalid escape sequence - should fall back to slicing
    strictEqual(Core.normalizeStructKeyText(String.raw`"\x invalid"`), String.raw`\x invalid`);
});

// Tests for stringifyStructKey
void test("stringifyStructKey preserves valid identifier keys", () => {
    strictEqual(Core.stringifyStructKey("name"), "name");
    strictEqual(Core.stringifyStructKey("_private"), "_private");
    strictEqual(Core.stringifyStructKey("$special"), "$special");
    strictEqual(Core.stringifyStructKey("camelCase"), "camelCase");
});

void test("stringifyStructKey preserves numeric string keys", () => {
    strictEqual(Core.stringifyStructKey("0"), "0");
    strictEqual(Core.stringifyStructKey("123"), "123");
    strictEqual(Core.stringifyStructKey("999"), "999");
});

void test("stringifyStructKey quotes keys with special characters", () => {
    strictEqual(Core.stringifyStructKey("my-key"), '"my-key"');
    strictEqual(Core.stringifyStructKey("hello world"), '"hello world"');
    strictEqual(Core.stringifyStructKey("foo.bar"), '"foo.bar"');
});

void test("stringifyStructKey quotes keys starting with digits", () => {
    strictEqual(Core.stringifyStructKey("123abc"), '"123abc"');
    strictEqual(Core.stringifyStructKey("0foo"), '"0foo"');
});

void test("stringifyStructKey normalizes quoted input before processing", () => {
    strictEqual(Core.stringifyStructKey('"name"'), "name");
    strictEqual(Core.stringifyStructKey("'identifier'"), "identifier");
    strictEqual(Core.stringifyStructKey('"123"'), "123");
});

void test("stringifyStructKey quotes normalized keys with special chars", () => {
    strictEqual(Core.stringifyStructKey('"my-key"'), '"my-key"');
    strictEqual(Core.stringifyStructKey("'hello world'"), '"hello world"');
});

void test("stringifyStructKey handles empty strings", () => {
    strictEqual(Core.stringifyStructKey('""'), '""');
    strictEqual(Core.stringifyStructKey("''"), '""');
});

void test("stringifyStructKey handles keys with escape sequences", () => {
    // After normalization, newline becomes actual newline which needs quoting
    strictEqual(Core.stringifyStructKey(String.raw`"line1\nline2"`), String.raw`"line1\nline2"`);
});
