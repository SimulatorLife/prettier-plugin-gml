/**
 * Regression tests for normalizeGmlFormatComponents.
 *
 * This is the single validation path for assembling GmlFormatComponentBundle
 * objects. A factory layer (createFormatComponentContractNormalizer) was
 * removed as dead code because it had no call sites; normalizeGmlFormatComponents
 * handles all validation directly.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultGmlFormatComponents } from "../src/components/default-format-components.js";
import { normalizeGmlFormatComponents } from "../src/components/format-component-normalizer.js";

void test("normalizeGmlFormatComponents rejects non-object input", () => {
    assert.throws(
        () => normalizeGmlFormatComponents(null),
        /GML format components must be an object/,
        "null input should throw"
    );
    assert.throws(
        () => normalizeGmlFormatComponents("string"),
        /GML format components must be an object/,
        "string input should throw"
    );
    assert.throws(
        () => normalizeGmlFormatComponents(42),
        /GML format components must be an object/,
        "number input should throw"
    );
});

void test("normalizeGmlFormatComponents rejects missing parsers", () => {
    assert.throws(
        () => normalizeGmlFormatComponents({ printers: {}, options: {} }),
        /GML format components must include parsers/,
        "missing parsers should throw"
    );
});

void test("normalizeGmlFormatComponents rejects missing printers", () => {
    assert.throws(
        () => normalizeGmlFormatComponents({ parsers: {}, options: {} }),
        /GML format components must include printers/,
        "missing printers should throw"
    );
});

void test("normalizeGmlFormatComponents rejects missing options", () => {
    assert.throws(
        () => normalizeGmlFormatComponents({ parsers: {}, printers: {} }),
        /GML format components must include options/,
        "missing options should throw"
    );
});

void test("normalizeGmlFormatComponents freezes the output bundle and all sub-maps", () => {
    const raw = createDefaultGmlFormatComponents();
    const normalized = normalizeGmlFormatComponents(raw);

    assert.ok(Object.isFrozen(normalized), "top-level bundle should be frozen");
    assert.ok(Object.isFrozen(normalized.parsers), "parsers map should be frozen");
    assert.ok(Object.isFrozen(normalized.printers), "printers map should be frozen");
    assert.ok(Object.isFrozen(normalized.options), "options map should be frozen");
});

void test("normalizeGmlFormatComponents preserves all entries from the source bundle", () => {
    const raw = createDefaultGmlFormatComponents();
    const normalized = normalizeGmlFormatComponents(raw);

    assert.ok(Object.hasOwn(normalized.parsers, "gml-parse"), "gml-parse parser must survive normalization");
    assert.ok(Object.hasOwn(normalized.printers, "gml-ast"), "gml-ast printer must survive normalization");
    assert.ok(
        Object.hasOwn(normalized.options, "logicalOperatorsStyle"),
        "logicalOperatorsStyle option must survive normalization"
    );
    assert.ok(
        Object.hasOwn(normalized.options, "allowInlineControlFlowBlocks"),
        "allowInlineControlFlowBlocks option must survive normalization"
    );
});

void test("normalizeGmlFormatComponents is the sole validation path — no contract-normalizer factory needed", () => {
    // createFormatComponentContractNormalizer was removed as an unused abstraction.
    // This test confirms the bundle produced by the standard path is fully valid
    // and complete without any intermediate contract-normalizer layer.
    const raw = createDefaultGmlFormatComponents();
    const normalized = normalizeGmlFormatComponents(raw);

    assert.strictEqual(typeof normalized.parsers["gml-parse"].parse, "function");
    assert.strictEqual(typeof normalized.printers["gml-ast"].print, "function");
});
