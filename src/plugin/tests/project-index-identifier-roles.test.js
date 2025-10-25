import assert from "node:assert/strict";
import test from "node:test";

import {
    IdentifierRole,
    assertValidIdentifierRole
} from "../src/project-index/identifier-roles.js";

test("assertValidIdentifierRole accepts declared roles", () => {
    assert.equal(
        assertValidIdentifierRole(IdentifierRole.Declaration),
        IdentifierRole.Declaration
    );
    assert.equal(
        assertValidIdentifierRole(IdentifierRole.Reference),
        IdentifierRole.Reference
    );
});

test("assertValidIdentifierRole rejects unknown values", () => {
    assert.throws(() => assertValidIdentifierRole("not-a-role"), {
        name: "TypeError",
        message: /Invalid identifier role/i
    });
});
