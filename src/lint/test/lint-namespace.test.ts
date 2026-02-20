import assert from "node:assert/strict";
import test from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

const { Lint } = LintWorkspace;

function assertIsFrozenObject(value: unknown, message: string) {
    assert.equal(typeof value, "object", `${message} should be an object`);
    assert.notEqual(value, null, `${message} should not be null`);
    assert.equal(Object.isFrozen(value), true, `${message} should be frozen`);
}

void test("Lint namespace exports plugin/configs/ruleIds/services and is deeply frozen at top level", () => {
    assertIsFrozenObject(Lint, "Lint");
    assertIsFrozenObject(Lint.plugin, "Lint.plugin");
    assertIsFrozenObject(Lint.featherPlugin, "Lint.featherPlugin");
    assertIsFrozenObject(Lint.configs, "Lint.configs");
    assertIsFrozenObject(Lint.ruleIds, "Lint.ruleIds");
    assertIsFrozenObject(Lint.services, "Lint.services");
});

void test("ruleIds contract keeps canonical ids with PascalCase keys", () => {
    const ruleIdEntries = Object.entries(Lint.ruleIds as Record<string, string>);
    assert.ok(ruleIdEntries.length > 0);

    for (const [mapKey, fullRuleId] of ruleIdEntries) {
        assert.match(mapKey, /^(?:Gml[A-Z]\w+|FeatherGM\d{4})$/, `Unexpected ruleIds key: ${mapKey}`);
        assert.match(fullRuleId, /^(?:gml|feather)\/.+$/, `Unexpected canonical full rule id: ${fullRuleId}`);
    }

    assert.equal((Lint.ruleIds as Record<string, string>).GmlNoGlobalvar, "feather/no-globalvar");
    assert.equal((Lint.ruleIds as Record<string, string>).FeatherGM1000, "feather/gm1000");
});

void test("config arrays are readonly FlatConfig[] values and share the pinned file glob", () => {
    const expectedGlob = Object.freeze(["**/*.gml"]);
    assert.deepEqual(expectedGlob, ["**/*.gml"]);

    const sets = [Lint.configs.recommended, Lint.configs.feather, Lint.configs.performance];
    for (const configSet of sets) {
        assert.ok(Array.isArray(configSet));
        assert.equal(Object.isFrozen(configSet), true);
        assert.ok(configSet.length > 0);
        for (const config of configSet) {
            assert.deepEqual(config.files, expectedGlob);
        }
    }

    const [recommended] = Lint.configs.recommended;
    assert.equal(recommended.language, "feather/gml");
    assert.equal(recommended.rules["feather/require-argument-separators"], "error");

    const [featherOverlay] = Lint.configs.feather;
    assert.equal(featherOverlay.plugins?.feather, Lint.featherPlugin);
});

void test("semver-sensitive lint constants are pinned", () => {
    assert.equal(Lint.services.featherManifest.schemaVersion, 1);
    assert.ok(Array.isArray(Lint.services.performanceOverrideRuleIds));
    assert.equal(Object.isFrozen(Lint.services.performanceOverrideRuleIds), true);
    for (const ruleId of Lint.services.performanceOverrideRuleIds) {
        assert.match(ruleId, /^(?:gml|feather)\/.+$/);
    }
});
