import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { visitChildNodes } from "../ast-node-helpers.js";

describe("visitChildNodes", () => {
    it("invokes the callback for every array entry", () => {
        const calls = [];

        visitChildNodes([1, { nested: true }], (...args) => {
            calls.push(args);
        });

        assert.equal(calls.length, 2);
        assert.deepEqual(calls[0], [1]);
        assert.deepEqual(calls[1], [{ nested: true }]);
    });

    it("only forwards object values from plain objects", () => {
        const child = { nested: true };
        const calls = [];

        visitChildNodes({ child, count: 1, empty: null }, (...args) => {
            calls.push(args);
        });

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0], [child]);
    });

    it("bails early for nullish parents", () => {
        const calls = [];

        visitChildNodes(null, (...args) => {
            calls.push(args);
        });
        visitChildNodes(undefined, (...args) => {
            calls.push(args);
        });

        assert.equal(calls.length, 0);
    });
});
