import { strictEqual } from "node:assert";
import { test } from "node:test";
import { lowerEnumDeclaration } from "../src/emitter/enum-lowering.js";

interface MockMember {
    name: string;
    initializer: string | number | null;
}

const mockResolveName = (member: MockMember): string => member.name;
const customResolver = (member: MockMember): string => `PREFIX_${member.name}`;

void test("lowerEnumDeclaration generates correct structure", () => {
    const result = lowerEnumDeclaration(
        "Colors",
        [
            { name: "RED", initializer: null },
            { name: "GREEN", initializer: null }
        ],
        String,
        mockResolveName
    );

    strictEqual(result.includes("const Colors = (() => {"), true);
    strictEqual(result.includes("const __enum = {};"), true);
    strictEqual(result.includes("let __value = -1;"), true);
    strictEqual(result.includes("return __enum;"), true);
    strictEqual(result.includes("})();"), true);
});

void test("lowerEnumDeclaration handles auto-incremented values", () => {
    const result = lowerEnumDeclaration(
        "Status",
        [
            { name: "IDLE", initializer: null },
            { name: "WALKING", initializer: null },
            { name: "RUNNING", initializer: null }
        ],
        String,
        mockResolveName
    );

    const incrementCount = (result.match(/__value \+= 1;/g) || []).length;
    strictEqual(incrementCount, 3);
    strictEqual(result.includes("__enum.IDLE = __value;"), true);
    strictEqual(result.includes("__enum.WALKING = __value;"), true);
    strictEqual(result.includes("__enum.RUNNING = __value;"), true);
});

void test("lowerEnumDeclaration handles explicit numeric initializers", () => {
    const result = lowerEnumDeclaration(
        "Priority",
        [
            { name: "LOW", initializer: 1 },
            { name: "HIGH", initializer: 10 }
        ],
        String,
        mockResolveName
    );

    strictEqual(result.includes("__value = 1;"), true);
    strictEqual(result.includes("__value = 10;"), true);
    strictEqual(result.includes("__enum.LOW = __value;"), true);
    strictEqual(result.includes("__enum.HIGH = __value;"), true);
});

void test("lowerEnumDeclaration handles explicit string initializers", () => {
    const result = lowerEnumDeclaration(
        "Keys",
        [
            { name: "ENTER", initializer: "enter" },
            { name: "ESC", initializer: "escape" }
        ],
        String,
        mockResolveName
    );

    strictEqual(result.includes("__value = enter;"), true);
    strictEqual(result.includes("__value = escape;"), true);
});

void test("lowerEnumDeclaration handles expression initializers", () => {
    const result = lowerEnumDeclaration(
        "Computed",
        [{ name: "TWO", initializer: { type: "BinaryExpression" } as unknown as number }],
        () => "(1 + 1)",
        mockResolveName
    );

    strictEqual(result.includes("__value = (1 + 1);"), true);
    strictEqual(result.includes("__enum.TWO = __value;"), true);
});

void test("lowerEnumDeclaration handles mixed auto and explicit values", () => {
    const result = lowerEnumDeclaration(
        "Mixed",
        [
            { name: "FIRST", initializer: null },
            { name: "SECOND", initializer: 10 },
            { name: "THIRD", initializer: null }
        ],
        String,
        mockResolveName
    );

    strictEqual(result.includes("__value += 1;"), true);
    strictEqual(result.includes("__value = 10;"), true);
    strictEqual(result.includes("__enum.FIRST = __value;"), true);
    strictEqual(result.includes("__enum.SECOND = __value;"), true);
    strictEqual(result.includes("__enum.THIRD = __value;"), true);
});

void test("lowerEnumDeclaration handles empty member list", () => {
    const result = lowerEnumDeclaration("Empty", [], String, mockResolveName);

    strictEqual(result.includes("const Empty = (() => {"), true);
    strictEqual(result.includes("const __enum = {};"), true);
    strictEqual(result.includes("return __enum;"), true);
});

void test("lowerEnumDeclaration preserves enum name", () => {
    const result = lowerEnumDeclaration(
        "MyCustomEnum",
        [{ name: "VALUE", initializer: null }],
        String,
        mockResolveName
    );

    strictEqual(result.includes("const MyCustomEnum = (() => {"), true);
});

void test("lowerEnumDeclaration uses custom resolver for member names", () => {
    const result = lowerEnumDeclaration("Test", [{ name: "ITEM", initializer: null }], String, customResolver);

    strictEqual(result.includes("__enum.PREFIX_ITEM = __value;"), true);
});
