import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getIterableSize,
    hasIterableItems,
    isAggregateErrorLike,
    isErrorLike,
    isMapLike,
    isRegExpLike,
    isSetLike,
    isSyntaxErrorWithLocation
} from "../utils/capability-probes.js";

describe("capability probes", () => {
    it("detects error-like values", () => {
        assert.equal(isErrorLike(new Error("boom")), true);
        assert.equal(isErrorLike({ message: "boom", name: "Custom" }), true);
        assert.equal(isErrorLike({ message: 42 }), false);
        assert.equal(
            isAggregateErrorLike(new AggregateError([], "boom")),
            true
        );
        assert.equal(
            isAggregateErrorLike({ message: "boom", errors: [new Error("x")] }),
            true
        );
        assert.equal(isAggregateErrorLike({ message: "boom" }), false);
    });

    it("identifies regexp-like inputs", () => {
        assert.equal(isRegExpLike(/abc/), true);
        const regExpLike = {
            exec: () => null,
            test: () => true
        };
        assert.equal(isRegExpLike(regExpLike), true);
        assert.equal(isRegExpLike({ test: () => true }), false);
    });

    it("guards map-like collaborators", () => {
        const base = new Map([["key", 1]]);
        const mapLike = {
            get(key) {
                return base.get(key);
            },
            set(key, value) {
                base.set(key, value);
                return this;
            },
            has(key) {
                return base.has(key);
            },
            [Symbol.iterator]() {
                return base[Symbol.iterator]();
            }
        };

        assert.equal(isMapLike(base), true);
        assert.equal(isMapLike(mapLike), true);
        assert.equal(hasIterableItems(mapLike), true);
        assert.equal(hasIterableItems(new Map()), false);
        assert.equal(getIterableSize(mapLike), 1);
    });

    it("guards set-like collaborators", () => {
        const base = new Set(["value"]);
        const setLike = {
            add(value) {
                base.add(value);
                return this;
            },
            has(value) {
                return base.has(value);
            },
            [Symbol.iterator]() {
                return base[Symbol.iterator]();
            }
        };

        assert.equal(isSetLike(base), true);
        assert.equal(isSetLike(setLike), true);
        assert.equal(hasIterableItems(setLike), true);
        assert.equal(hasIterableItems(new Set()), false);
        assert.equal(getIterableSize(setLike), 1);
    });

    it("counts iterables without explicit size", () => {
        const iterable = {
            *[Symbol.iterator]() {
                yield "a";
                yield "b";
            }
        };

        assert.equal(getIterableSize(iterable), 2);
    });

    it("identifies syntax errors with location metadata", () => {
        const syntaxErrorLike = {
            message: "boom",
            line: 4,
            column: 2,
            rule: "expression",
            wrongSymbol: "token",
            offendingText: "x"
        };

        assert.equal(isSyntaxErrorWithLocation(syntaxErrorLike), true);
        assert.equal(
            isSyntaxErrorWithLocation({ message: "boom", line: "3" }),
            true
        );
        assert.equal(
            isSyntaxErrorWithLocation({ message: "boom", line: 4, rule: 5 }),
            false
        );
        assert.equal(isSyntaxErrorWithLocation({ message: "boom" }), false);
    });
});
