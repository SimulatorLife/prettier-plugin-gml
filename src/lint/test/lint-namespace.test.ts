import assert from "node:assert/strict";
import { test } from "node:test";

import { PERFORMANCE_OVERRIDE_RULE_IDS } from "../src/configs/performance-rule-ids.js";
import { Lint } from "../src/index.js";

test("Lint namespace exports plugin/configs/ruleIds/services", () => {
    assert.ok(Lint.plugin);
    assert.ok(Lint.configs);
    assert.ok(Lint.ruleIds);
    assert.ok(Lint.services);
});

test("PERFORMANCE_OVERRIDE_RULE_IDS are canonical full ids", () => {
    for (const ruleId of PERFORMANCE_OVERRIDE_RULE_IDS) {
        assert.ok(ruleId.includes("/"), `Expected canonical full rule id, received: ${ruleId}`);
    }
});

test("recommended baseline includes pinned gml rules", () => {
    const [recommended] = Lint.configs.recommended;
    assert.ok(recommended);
    assert.equal(recommended.language, "gml/gml");
    assert.equal(recommended.rules["gml/require-argument-separators"], "error");
    assert.equal(recommended.rules["gml/no-globalvar"], "warn");
});

test("feather manifest is exported as typed runtime data", () => {
    assert.equal(Lint.services.featherManifest.schemaVersion, 1);
    assert.ok(Lint.services.featherManifest.entries.length > 0);
    assert.ok(Lint.services.featherManifest.entries[0]?.ruleId.startsWith("feather/"));
});

test("ruleIds include canonical IDs for gml and feather namespaces", () => {
    assert.equal(Lint.ruleIds.GmlNoGlobalvar, "gml/no-globalvar");
    assert.equal((Lint.ruleIds as Record<string, string>).FeatherGM1000, "feather/gm1000");
});

const FEATHER_ID_PATTERN = /^GM\d{4}$/u;
const FEATHER_RULE_PATTERN = /^feather\/gm\d{4}$/u;
const EXPECTED_MESSAGE_IDS = Object.freeze(["diagnostic", "unsafeFix", "missingProjectContext"]);
const SHARED_UNSAFE_FIX_MESSAGE = "[unsafe-fix:SEMANTIC_AMBIGUITY] Unsafe fix omitted.";

test("feather manifest entries enforce deterministic GM#### <-> feather/gm#### mapping", () => {
    for (const entry of Lint.services.featherManifest.entries) {
        assert.match(entry.id, FEATHER_ID_PATTERN);
        assert.match(entry.ruleId, FEATHER_RULE_PATTERN);
        assert.equal(entry.ruleId, `feather/${entry.id.toLowerCase()}`);
        assert.equal(entry.id, entry.ruleId.replace("feather/", "").toUpperCase());
    }
});

test("feather manifest entries define full parity metadata contract", () => {
    for (const entry of Lint.services.featherManifest.entries) {
        assert.ok(typeof entry.id === "string");
        assert.ok(typeof entry.ruleId === "string");
        assert.ok(entry.defaultSeverity === "warn" || entry.defaultSeverity === "error");
        assert.ok(entry.fixability === "none" || entry.fixability === "safe-only" || entry.fixability === "always");
        assert.ok(typeof entry.requiresProjectContext === "boolean");
        assert.equal(entry.fixScope, "local-only");
        assert.deepEqual(entry.messageIds, EXPECTED_MESSAGE_IDS);
    }
});

test("feather rule catalog matches manifest coverage and shared message semantics", () => {
    const featherRuleIds = new Set(
        Object.keys(Lint.plugin.rules)
            .filter((ruleId) => ruleId.startsWith("gm"))
            .map((shortName) => `feather/${shortName}`)
    );

    const manifestRuleIds = new Set(Lint.services.featherManifest.entries.map((entry) => entry.ruleId));
    assert.deepEqual([...featherRuleIds].sort(), [...manifestRuleIds].sort());

    for (const entry of Lint.services.featherManifest.entries) {
        const shortName = entry.ruleId.replace("feather/", "");
        const rule = Lint.plugin.rules[shortName] as { meta: { messages: Record<string, string> } };
        assert.ok(rule.meta.messages.diagnostic);
        assert.equal(rule.meta.messages.unsafeFix, SHARED_UNSAFE_FIX_MESSAGE);
        assert.ok(rule.meta.messages.missingProjectContext);
    }
});

test("feather config severities are generated from manifest defaults", () => {
    const [featherConfig] = Lint.configs.feather;
    const configuredRuleIds = Object.keys(featherConfig.rules);
    const manifestRuleIds = Lint.services.featherManifest.entries.map((entry) => entry.ruleId);

    assert.deepEqual(configuredRuleIds.sort(), manifestRuleIds.sort());

    for (const entry of Lint.services.featherManifest.entries) {
        const severity = featherConfig.rules[entry.ruleId];
        assert.ok(severity === "warn" || severity === "error");
        assert.equal(severity, entry.defaultSeverity);
    }
});

test("all lint rules share the same unsafeFix message text", () => {
    for (const [ruleId, rule] of Object.entries(Lint.plugin.rules)) {
        const module = rule as { meta: { messages: Record<string, string> } };
        assert.equal(module.meta.messages.unsafeFix, SHARED_UNSAFE_FIX_MESSAGE, `${ruleId} unsafeFix mismatch`);
    }
});
