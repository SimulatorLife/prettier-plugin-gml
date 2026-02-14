import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { __lintCommandTest__ } from "../src/commands/lint.js";

const { Lint } = LintWorkspace;

void test("wiring requires both plugin identity and language", () => {
    assert.equal(
        __lintCommandTest__.isCanonicalGmlWiring({
            plugins: { gml: LintWorkspace.Lint.plugin },
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
            plugins: { gml: LintWorkspace.Lint.plugin },
            language: "not-gml"
        }),
        false
    );
});

void test("severity normalization handles canonical and conservative cases", () => {
    assert.equal(__lintCommandTest__.isAppliedRuleValue("off"), false);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(" OFF "), false);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(0), false);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(["off", {}]), false);
    assert.equal(__lintCommandTest__.isAppliedRuleValue([0, {}]), false);

    assert.equal(__lintCommandTest__.isAppliedRuleValue("warn"), true);
    assert.equal(__lintCommandTest__.isAppliedRuleValue(" Warn "), true);
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
    const performanceId = LintWorkspace.Lint.services.performanceOverrideRuleIds[0];

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

void test("flat config discovery searches cwd ancestors in candidate order", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gml-lint-discovery-"));
    const nestedDirectory = path.join(tempRoot, "a", "b");
    await fs.mkdir(nestedDirectory, { recursive: true });

    const expectedConfig = path.join(tempRoot, "eslint.config.mjs");
    await fs.writeFile(expectedConfig, "export default [];\n", "utf8");

    const discovery = __lintCommandTest__.discoverFlatConfig(nestedDirectory);

    assert.equal(discovery.selectedConfigPath, expectedConfig);
    assert.ok(discovery.searchedPaths.length > 0);
    assert.deepEqual(
        discovery.searchedPaths.slice(0, __lintCommandTest__.FLAT_CONFIG_CANDIDATES.length),
        __lintCommandTest__.FLAT_CONFIG_CANDIDATES.map((candidate) => path.join(nestedDirectory, candidate))
    );
});

void test("formatter normalization preserves unknown names for explicit validation", () => {
    assert.equal(__lintCommandTest__.normalizeFormatterName(undefined), "stylish");
    assert.equal(__lintCommandTest__.normalizeFormatterName("JSON"), "json");
    assert.equal(__lintCommandTest__.normalizeFormatterName("custom"), "custom");
    assert.equal(__lintCommandTest__.isSupportedFormatter("stylish"), true);
    assert.equal(__lintCommandTest__.isSupportedFormatter("json"), true);
    assert.equal(__lintCommandTest__.isSupportedFormatter("checkstyle"), true);
    assert.equal(__lintCommandTest__.isSupportedFormatter("custom"), false);
});

void test("explicit config validation fails on missing file", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gml-lint-config-"));
    const missingPath = path.join(tempRoot, "missing.config.js");

    await assert.rejects(() => __lintCommandTest__.validateExplicitConfigPath(missingPath));
});

void test("fully wired overlay does not trigger guardrail", async () => {
    const eslint = {
        async calculateConfigForFile(): Promise<unknown> {
            return {
                plugins: { gml: Lint.plugin },
                language: "gml/gml",
                rules: {
                    [Lint.services.performanceOverrideRuleIds[0]]: "warn"
                }
            };
        }
    };

    const offendingPaths = await __lintCommandTest__.collectOverlayWithoutLanguageWiringPaths({
        eslint,
        results: [{ filePath: "/tmp/fully-wired.gml" }]
    });

    assert.deepEqual(offendingPaths, []);
});

void test("partially wired overlay triggers guardrail", async () => {
    const eslint = {
        async calculateConfigForFile(filePath: string): Promise<unknown> {
            if (filePath.endsWith("plugin-only.gml")) {
                return {
                    plugins: { gml: Lint.plugin },
                    language: "js/js",
                    rules: {
                        [Lint.services.performanceOverrideRuleIds[0]]: "warn"
                    }
                };
            }

            return {
                plugins: { gml: {} },
                language: "gml/gml",
                rules: {
                    [Lint.services.performanceOverrideRuleIds[0]]: [2, {}]
                }
            };
        }
    };

    const offendingPaths = await __lintCommandTest__.collectOverlayWithoutLanguageWiringPaths({
        eslint,
        results: [{ filePath: "/tmp/plugin-only.gml" }, { filePath: "/tmp/language-only.gml" }]
    });

    assert.deepEqual(offendingPaths, ["/tmp/plugin-only.gml", "/tmp/language-only.gml"]);
});

void test("configured but non-applied overlay does not trigger guardrail", async () => {
    const performanceRuleId = Lint.services.performanceOverrideRuleIds[0];
    const eslint = {
        async calculateConfigForFile(): Promise<unknown> {
            return {
                plugins: { gml: {} },
                language: "js/js",
                rules: {
                    [performanceRuleId]: ["off", { reason: "disabled" }],
                    "feather/noisy": 0
                }
            };
        }
    };

    const offendingPaths = await __lintCommandTest__.collectOverlayWithoutLanguageWiringPaths({
        eslint,
        results: [{ filePath: "/tmp/not-applied.gml" }]
    });

    assert.deepEqual(offendingPaths, []);
});
