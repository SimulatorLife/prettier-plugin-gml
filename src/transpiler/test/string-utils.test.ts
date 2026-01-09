import { strictEqual } from "node:assert";
import { test } from "node:test";
import {
    isIdentifierLike,
    escapeTemplateText,
    stringifyStructKey,
    normalizeStructKeyText
} from "../src/emitter/string-utils.js";

// Tests for isIdentifierLike
void test("isIdentifierLike accepts valid JavaScript identifiers", () => {
    strictEqual(isIdentifierLike("foo"), true);
    strictEqual(isIdentifierLike("bar123"), true);
    strictEqual(isIdentifierLike("_private"), true);
    strictEqual(isIdentifierLike("$jquery"), true);
    strictEqual(isIdentifierLike("CamelCase"), true);
    strictEqual(isIdentifierLike("snake_case"), true);
    strictEqual(isIdentifierLike("CONSTANT"), true);
});

void test("isIdentifierLike rejects invalid identifiers starting with digits", () => {
    strictEqual(isIdentifierLike("123abc"), false);
    strictEqual(isIdentifierLike("0foo"), false);
});

void test("isIdentifierLike rejects identifiers with special characters", () => {
    strictEqual(isIdentifierLike("my-var"), false);
    strictEqual(isIdentifierLike("hello.world"), false);
    strictEqual(isIdentifierLike("foo bar"), false);
    strictEqual(isIdentifierLike("foo@bar"), false);
    strictEqual(isIdentifierLike("a+b"), false);
});

void test("isIdentifierLike rejects empty string", () => {
    strictEqual(isIdentifierLike(""), false);
});

void test("isIdentifierLike accepts single character identifiers", () => {
    strictEqual(isIdentifierLike("x"), true);
    strictEqual(isIdentifierLike("_"), true);
    strictEqual(isIdentifierLike("$"), true);
});

// Tests for escapeTemplateText
void test("escapeTemplateText leaves plain text unchanged", () => {
    strictEqual(escapeTemplateText("hello world"), "hello world");
    strictEqual(escapeTemplateText("simple text"), "simple text");
    strictEqual(escapeTemplateText(""), "");
});

void test("escapeTemplateText escapes backticks", () => {
    strictEqual(escapeTemplateText("hello `world`"), "hello \\`world\\`");
    strictEqual(escapeTemplateText("`quoted`"), "\\`quoted\\`");
    strictEqual(escapeTemplateText("multiple ` backticks ` here"), "multiple \\` backticks \\` here");
});

void test("escapeTemplateText escapes template interpolation syntax", () => {
    strictEqual(escapeTemplateText("cost: ${price}"), "cost: \\${price}");
    strictEqual(escapeTemplateText("${foo} and ${bar}"), "\\${foo} and \\${bar}");
    strictEqual(escapeTemplateText("value is ${x}"), "value is \\${x}");
});

void test("escapeTemplateText escapes both backticks and interpolation", () => {
    strictEqual(escapeTemplateText("`template ${expr}`"), "\\`template \\${expr}\\`");
    strictEqual(escapeTemplateText("${a} `mixed` ${b}"), "\\${a} \\`mixed\\` \\${b}");
});

// Tests for normalizeStructKeyText
void test("normalizeStructKeyText removes double quotes from quoted strings", () => {
    strictEqual(normalizeStructKeyText('"hello"'), "hello");
    strictEqual(normalizeStructKeyText('"world"'), "world");
    strictEqual(normalizeStructKeyText('""'), "");
});

void test("normalizeStructKeyText removes single quotes from quoted strings", () => {
    strictEqual(normalizeStructKeyText("'hello'"), "hello");
    strictEqual(normalizeStructKeyText("'world'"), "world");
    strictEqual(normalizeStructKeyText("''"), "");
});

void test("normalizeStructKeyText handles JSON escape sequences in double quotes", () => {
    strictEqual(normalizeStructKeyText(String.raw`"hello\nworld"`), "hello\nworld");
    strictEqual(normalizeStructKeyText(String.raw`"tab\there"`), "tab\there");
    strictEqual(normalizeStructKeyText(String.raw`"quote: \"test\""`), 'quote: "test"');
});

void test("normalizeStructKeyText returns unquoted strings unchanged", () => {
    strictEqual(normalizeStructKeyText("unquoted"), "unquoted");
    strictEqual(normalizeStructKeyText("my_identifier"), "my_identifier");
    strictEqual(normalizeStructKeyText("123"), "123");
});

void test("normalizeStructKeyText returns mismatched quotes unchanged", () => {
    strictEqual(normalizeStructKeyText("\"mixed'"), "\"mixed'");
    strictEqual(normalizeStructKeyText("'\"wrong"), "'\"wrong");
});

void test("normalizeStructKeyText handles single characters", () => {
    strictEqual(normalizeStructKeyText('"a"'), "a");
    strictEqual(normalizeStructKeyText("'x'"), "x");
    strictEqual(normalizeStructKeyText("a"), "a");
});

void test("normalizeStructKeyText handles strings shorter than 2 characters", () => {
    strictEqual(normalizeStructKeyText('"'), '"');
    strictEqual(normalizeStructKeyText("'"), "'");
    strictEqual(normalizeStructKeyText(""), "");
});

void test("normalizeStructKeyText handles malformed JSON gracefully", () => {
    // Invalid escape sequence - should fall back to slicing
    strictEqual(normalizeStructKeyText(String.raw`"\x invalid"`), String.raw`\x invalid`);
});

// Tests for stringifyStructKey
void test("stringifyStructKey preserves valid identifier keys", () => {
    strictEqual(stringifyStructKey("name"), "name");
    strictEqual(stringifyStructKey("_private"), "_private");
    strictEqual(stringifyStructKey("$special"), "$special");
    strictEqual(stringifyStructKey("camelCase"), "camelCase");
});

void test("stringifyStructKey preserves numeric string keys", () => {
    strictEqual(stringifyStructKey("0"), "0");
    strictEqual(stringifyStructKey("123"), "123");
    strictEqual(stringifyStructKey("999"), "999");
});

void test("stringifyStructKey quotes keys with special characters", () => {
    strictEqual(stringifyStructKey("my-key"), '"my-key"');
    strictEqual(stringifyStructKey("hello world"), '"hello world"');
    strictEqual(stringifyStructKey("foo.bar"), '"foo.bar"');
});

void test("stringifyStructKey quotes keys starting with digits", () => {
    strictEqual(stringifyStructKey("123abc"), '"123abc"');
    strictEqual(stringifyStructKey("0foo"), '"0foo"');
});

void test("stringifyStructKey normalizes quoted input before processing", () => {
    strictEqual(stringifyStructKey('"name"'), "name");
    strictEqual(stringifyStructKey("'identifier'"), "identifier");
    strictEqual(stringifyStructKey('"123"'), "123");
});

void test("stringifyStructKey quotes normalized keys with special chars", () => {
    strictEqual(stringifyStructKey('"my-key"'), '"my-key"');
    strictEqual(stringifyStructKey("'hello world'"), '"hello world"');
});

void test("stringifyStructKey handles empty strings", () => {
    strictEqual(stringifyStructKey('""'), '""');
    strictEqual(stringifyStructKey("''"), '""');
});

void test("stringifyStructKey handles keys with escape sequences", () => {
    // After normalization, newline becomes actual newline which needs quoting
    strictEqual(stringifyStructKey(String.raw`"line1\nline2"`), String.raw`"line1\nline2"`);
});
