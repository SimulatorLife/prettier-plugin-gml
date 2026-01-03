import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    ensureMap,
    ensureSet,
    getIterableSize,
    hasFunction,
    hasIterableItems,
    isAggregateErrorLike,
    isErrorLike,
    isMapLike,
    isRegExpLike,
    isSetLike,
    isWorkspaceEditLike
} from "../src/utils/capability-probes.js";

void describe("capability probes", () => {
    void it("detects callable properties", () => {
        const method = Symbol("method");
        const target = {
            run() {},
            [method]() {}
        };

        assert.equal(hasFunction(target, "run"), true);
        assert.equal(hasFunction(target, method), true);
        assert.equal(hasFunction({ run: 1 }, "run"), false);
        assert.equal(hasFunction(null, "run"), false);
    });

    void it("detects error-like values", () => {
        assert.equal(isErrorLike(new Error("boom")), true);
        assert.equal(isErrorLike({ message: "boom", name: "Custom" }), true);
        assert.equal(isErrorLike({ message: 42 }), false);
        assert.equal(isAggregateErrorLike(new AggregateError([], "boom")), true);
        assert.equal(isAggregateErrorLike({ message: "boom", errors: [new Error("x")] }), true);
        assert.equal(isAggregateErrorLike({ message: "boom" }), false);
    });

    void it("identifies regexp-like inputs", () => {
        assert.equal(isRegExpLike(/abc/), true);
        const regExpLike = {
            exec: () => null,
            test: () => true
        };
        assert.equal(isRegExpLike(regExpLike), true);
        assert.equal(isRegExpLike({ test: () => true }), false);
    });

    void it("guards map-like collaborators", () => {
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

    void it("guards set-like collaborators", () => {
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

    void it("counts iterables without explicit size", () => {
        const iterable = {
            *[Symbol.iterator]() {
                yield "a";
                yield "b";
            }
        };

        assert.equal(getIterableSize(iterable), 2);
    });

    void it("ensures set-like collaborators remain writable", () => {
        const existing = new Set(["macro"]);
        assert.equal(ensureSet(existing), existing);

        const fromArray = ensureSet(["macro", "macro"]);
        assert.deepEqual([...fromArray], ["macro"]);

        assert.equal(ensureSet("macro").size, 0);
    });

    void it("coerces map-like collaborators into normalized maps", () => {
        const base = new Map([["id", { status: "passed" }]]);
        const adapter = {
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
            entries() {
                return base.entries();
            }
        };

        const normalized = ensureMap(adapter);
        assert.equal(normalized, adapter);

        const fromObject = ensureMap({
            id: { status: "failed" }
        });

        assert.equal(fromObject instanceof Map, true);
        assert.equal(fromObject.get("id")?.status, "failed");
    });

    void it("ignores invalid iterable shapes when normalizing maps", () => {
        assert.equal(ensureMap(new Set(["value"])).size, 0);

        const invalidIterable = {
            [Symbol.iterator]() {
                return ["value"][Symbol.iterator]();
            }
        };

        assert.equal(ensureMap(invalidIterable).size, 0);
    });

    void it("identifies workspace-edit-like objects", () => {
        const validWorkspaceEdit = {
            edits: [],
            addEdit() {},
            groupByFile() {
                return new Map();
            }
        };

        assert.equal(isWorkspaceEditLike(validWorkspaceEdit), true);

        assert.equal(isWorkspaceEditLike({ edits: [] }), false);
        assert.equal(isWorkspaceEditLike({ edits: [], addEdit() {} }), false);
        assert.equal(isWorkspaceEditLike({ addEdit() {}, groupByFile() {} }), false);
        assert.equal(isWorkspaceEditLike(null), false);
        assert.equal(isWorkspaceEditLike(), false);
        assert.equal(
            isWorkspaceEditLike({
                edits: "not an array",
                addEdit() {},
                groupByFile() {}
            }),
            false
        );
    });
});
