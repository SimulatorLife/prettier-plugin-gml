import assert from "node:assert/strict";
import test from "node:test";

import {
    formatIdentifierCaseWithOptions,
    normalizeIdentifierCaseWithOptions
} from "../../shared/identifier-case/identifier-case-utils.js";

test("normalizeIdentifierCase accepts custom reserved prefix overrides", () => {
    const identifier = "module:subsystem.value";
    const overrides = { reservedPrefixes: ["module:", "module:sub"] };

    const normalized = normalizeIdentifierCaseWithOptions(
        identifier,
        overrides
    );

    assert.equal(normalized.prefix, "module:sub");
    assert.equal(normalized.tokens.length, 2);
    assert.equal(normalized.tokens[0].normalized, "system");
    assert.equal(normalized.tokens[1].normalized, "value");
});

test("custom reserved prefixes remain intact during formatting", () => {
    const identifier = "custom.scope_value";
    const formatOptions = { reservedPrefixes: ["custom.", "custom.scope_"] };

    const normalized = normalizeIdentifierCaseWithOptions(
        identifier,
        formatOptions
    );
    assert.equal(normalized.prefix, "custom.scope_");

    const converted = formatIdentifierCaseWithOptions(
        identifier,
        "snake-upper",
        formatOptions
    );
    assert.equal(converted, "custom.scope_VALUE");
});
