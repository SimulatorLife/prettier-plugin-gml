import assert from "node:assert/strict";
import test from "node:test";

import {
    IdentifierRole,
    assertValidIdentifierRole
} from "../src/project-index/identifier-roles.js";

test("assertValidIdentifierRole accepts declared roles", () => {
    assert.equal(
        assertValidIdentifierRole(IdentifierRole.DECLARATION),
        IdentifierRole.DECLARATION
    );
    assert.equal(
        assertValidIdentifierRole(IdentifierRole.REFERENCE),
        IdentifierRole.REFERENCE
    );
});

test("assertValidIdentifierRole rejects unknown values", () => {
    assert.throws(() => assertValidIdentifierRole("not-a-role"), {
        name: "TypeError",
        message: /Invalid identifier role/i
    });
});
