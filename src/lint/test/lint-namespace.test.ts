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
