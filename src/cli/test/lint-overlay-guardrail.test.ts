import assert from "node:assert/strict";
import test from "node:test";

import { Lint } from "@gml-modules/lint";

import { __lintCommandTest__ } from "../src/commands/lint.js";

void test("wiring requires both plugin identity and language", () => {
    assert.equal(
        __lintCommandTest__.isCanonicalGmlWiring({
            plugins: { gml: Lint.plugin },
            language: "gml/gml"
        }),
        true
    );

    assert.equal(
        __lintCommandTest__.isCanonicalGmlWiring({
            plugins: { gml: {} },
            language: "gml/gml"
        }),
        false
    );

    assert.equal(
        __lintCommandTest__.isCanonicalGmlWiring({
            plugins: { gml: Lint.plugin },
            language: "not-gml"
        }),
        false
    );
});

void test("severity normalization handles canonical and conservative cases", () => {
    assert.equal(__lintCommandTest__.isAppliedRuleValue("off"), false);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(0), false);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(["off", {}]), false);
    assert.equal(__lintCommandTest__.isAppliedRuleValue([0, {}]), false);

    assert.equal(__lintCommandTest__.isAppliedRuleValue("warn"), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue("error"), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(1), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(2), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(["warn", {}]), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue([2, {}]), true);

    assert.equal(__lintCommandTest__.isAppliedRuleValue([]), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue([null, {}]), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue([true, {}]), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue([{ bad: true }, {}]), true);
});

void test("missing rules means no overlay rules applied", () => {
    assert.equal(__lintCommandTest__.hasOverlayRuleApplied({}), false);
    assert.equal(__lintCommandTest__.hasOverlayRuleApplied({ rules: undefined }), false);
    assert.equal(__lintCommandTest__.hasOverlayRuleApplied({ rules: null }), false);
});

void test("overlay matching uses exact canonical full rule IDs", () => {
    const performanceId = Lint.services.performanceOverrideRuleIds[0];

    assert.equal(
        __lintCommandTest__.hasOverlayRuleApplied({
            rules: {
                [performanceId]: "warn"
            }
        }),
        true
    );

    assert.equal(
        __lintCommandTest__.hasOverlayRuleApplied({
            rules: {
                [performanceId.toUpperCase()]: "warn"
            }
        }),
        false
    );

    assert.equal(
        __lintCommandTest__.hasOverlayRuleApplied({
            rules: {
                feather: "warn"
            }
        }),
        false
    );
});

void test("overlay warning output is deduped per invocation and bounded", () => {
    const paths = Array.from({ length: 25 }, (_, index) => `/tmp/${index}.gml`);
    const rendered = __lintCommandTest__.formatOverlayWarning(paths);

    assert.match(rendered, /^GML_OVERLAY_WITHOUT_LANGUAGE_WIRING:/);
    assert.match(rendered, /\/tmp\/0\.gml/);
    assert.match(rendered, /\/tmp\/19\.gml/);
    assert.doesNotMatch(rendered, /\/tmp\/20\.gml/);
    assert.match(rendered, /and 5 more\.\.\./);
});
