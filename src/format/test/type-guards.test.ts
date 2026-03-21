import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AstPath } from "prettier";

import { isInsideConstructorFunction } from "../src/printer/type-guards.js";

function makePath(ancestors: Array<{ type: string } | null>): AstPath<any> {
    return {
        getValue: () => ({ type: "Identifier" }),
        getParentNode: (level: number = 0) => ancestors[level] ?? null
    } as unknown as AstPath<any>;
}

void describe("type guard helpers", () => {
    void it("detects function declarations nested inside constructors", () => {
        const path = makePath([
            { type: "FunctionDeclaration" },
            { type: "BlockStatement" },
            { type: "ConstructorDeclaration" },
            { type: "Program" }
        ]);

        assert.equal(isInsideConstructorFunction(path), true);
    });

    void it("returns false when no constructor ancestor exists", () => {
        const path = makePath([{ type: "FunctionDeclaration" }, { type: "BlockStatement" }, { type: "Program" }]);

        assert.equal(isInsideConstructorFunction(path), false);
    });

    void it("returns false when a constructor is not separated by a function declaration", () => {
        const path = makePath([{ type: "BlockStatement" }, { type: "ConstructorDeclaration" }, { type: "Program" }]);

        assert.equal(isInsideConstructorFunction(path), false);
    });

    void it("returns false when the function declaration is not owned by a block", () => {
        const path = makePath([
            { type: "FunctionDeclaration" },
            { type: "ConstructorDeclaration" },
            { type: "Program" }
        ]);

        assert.equal(isInsideConstructorFunction(path), false);
    });
});
