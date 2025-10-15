import test from "node:test";
import assert from "node:assert/strict";

import { loadReservedIdentifierNames } from "../src/reserved-identifiers.js";

test("loadReservedIdentifierNames returns lowercase reserved names", () => {
    const reserved = loadReservedIdentifierNames();

    assert.equal(reserved instanceof Set, true);
    assert.equal(reserved.has("abs"), true);
    assert.equal(reserved.has("if"), false);
});

test("loadReservedIdentifierNames respects custom disallowed types", () => {
    const reserved = loadReservedIdentifierNames({ disallowedTypes: [] });

    assert.equal(reserved.has("if"), true);
});
