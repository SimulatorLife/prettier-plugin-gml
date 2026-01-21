import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getArrayProperty,
    getBodyStatements,
    hasArrayPropertyEntries,
    hasBodyStatements,
    isProgramOrBlockStatement
} from "../src/ast/node-helpers.js";

void describe("array property helpers", () => {
    void it("returns empty arrays for invalid inputs", () => {
        assert.deepEqual(getArrayProperty(null, "items"), []);
        assert.deepEqual(getArrayProperty({}, "123"), []);
        assert.deepEqual(getArrayProperty({ items: null }, "items"), []);
        assert.deepEqual(getBodyStatements(null), []);
    });

    void it("returns the original array reference when present", () => {
        const values = [1, 2, 3];
        const node = { type: "Mock", values };
        assert.equal(getArrayProperty(node, "values"), values);

        const statements = [{ type: "ExpressionStatement" }];
        const bodyNode = { type: "Program", body: statements };
        assert.equal(getBodyStatements(bodyNode), statements);
    });

    void it("detects whether an array property has entries", () => {
        assert.equal(hasArrayPropertyEntries({ type: "Mock", items: [] }, "items"), false);
        assert.equal(hasArrayPropertyEntries({ type: "Mock", items: [0] }, "items"), true);
        assert.equal(hasArrayPropertyEntries({ type: "Mock" }, "items"), false);

        assert.equal(hasBodyStatements({ type: "Program", body: [] }), false);
        assert.equal(hasBodyStatements({ type: "Program", body: [{ type: "ExpressionStatement" }] }), true);
    });

    void it("identifies program and block statement nodes", () => {
        assert.equal(isProgramOrBlockStatement({ type: "Program" }), true);
        assert.equal(isProgramOrBlockStatement({ type: "BlockStatement" }), true);
        assert.equal(isProgramOrBlockStatement({ type: "SwitchCase" }), false);
        assert.equal(isProgramOrBlockStatement(null), false);
        assert.equal(isProgramOrBlockStatement({}), false);
    });
});
