import assert from "node:assert/strict";
import test from "node:test";

import {
    __resetCachedFeatherMetadata,
    getFeatherDiagnosticById,
    getFeatherDiagnostics,
    getFeatherMetadata
} from "../src/resources/feather-metadata.js";

test("getFeatherMetadata returns the bundled payload", () => {
    __resetCachedFeatherMetadata();
    const metadata = getFeatherMetadata();

    assert.equal(typeof metadata, "object");
    assert.ok(Array.isArray(metadata.diagnostics));
});

test("getFeatherDiagnostics exposes diagnostic entries", () => {
    __resetCachedFeatherMetadata();
    const diagnostics = getFeatherDiagnostics();

    assert.ok(Array.isArray(diagnostics));
    assert.ok(
        diagnostics.some((diagnostic) => diagnostic?.id === "GM1010"),
        "Expected GM1010 diagnostic to be present"
    );
});

test("getFeatherDiagnosticById resolves entries with surrounding whitespace", () => {
    __resetCachedFeatherMetadata();
    const diagnostic = getFeatherDiagnosticById("  GM1010  ");

    assert.equal(diagnostic?.id, "GM1010");
    assert.equal(typeof diagnostic?.title, "string");
});

test("getFeatherDiagnosticById returns null for unknown ids", () => {
    __resetCachedFeatherMetadata();
    assert.equal(getFeatherDiagnosticById("GM9999"), null);
});
