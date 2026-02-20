import type { LintPluginShape } from "../plugin.js";
import { featherManifest } from "../rules/feather/manifest.js";
import { PERFORMANCE_OVERRIDE_RULE_IDS } from "./performance-rule-ids.js";

/**
 * Represents a pinned lint flat-config entry exposed by the lint namespace.
 */
export type FlatConfig = Readonly<{
    files: ReadonlyArray<string>;
    plugins?: Readonly<Record<string, LintPluginShape>>;
    language?: string;
    rules: Readonly<Record<string, "off" | "warn" | "error">>;
}>;

export const GML_LINT_FILES_GLOB = Object.freeze(["**/*.gml"]);

const RECOMMENDED_RULES = Object.freeze({
    "feather/prefer-loop-length-hoist": "warn",
    "feather/prefer-hoistable-loop-accessors": "warn",
    "feather/prefer-repeat-loops": "warn",
    "feather/prefer-struct-literal-assignments": "warn",
    "feather/optimize-logical-flow": "warn",
    "feather/no-globalvar": "warn",
    "feather/normalize-doc-comments": "warn",
    "feather/normalize-directives": "warn",
    "feather/require-control-flow-braces": "warn",
    "feather/no-assignment-in-condition": "warn",
    "feather/prefer-is-undefined-check": "warn",
    "feather/prefer-epsilon-comparisons": "warn",
    "feather/normalize-operator-aliases": "warn",
    "feather/prefer-string-interpolation": "warn",
    "feather/optimize-math-expressions": "warn",
    "feather/require-argument-separators": "error"
});

const FEATHER_RULES: Readonly<Record<`feather/${string}`, "warn" | "error">> = Object.freeze(
    Object.fromEntries(featherManifest.entries.map((entry) => [entry.ruleId, entry.defaultSeverity])) as Record<
        `feather/${string}`,
        "warn" | "error"
    >
);

function createPerformanceRuleSet(): Readonly<Record<string, "off" | "warn" | "error">> {
    const rules: Record<string, "off" | "warn" | "error"> = {
        "gml/prefer-loop-length-hoist": "off",
        "gml/prefer-struct-literal-assignments": "off",
        "gml/no-globalvar": "warn",
        "gml/prefer-string-interpolation": "off"
    };

    for (const ruleId of PERFORMANCE_OVERRIDE_RULE_IDS) {
        if (!(ruleId in rules)) {
            rules[ruleId] = "off";
        }
    }

    return Object.freeze(rules);
}

const PERFORMANCE_RULES = createPerformanceRuleSet();

/**
 * Represents the immutable lint config sets exported through `Lint.configs`.
 */
export type LintConfigSets = Readonly<{
    recommended: ReadonlyArray<FlatConfig>;
    feather: ReadonlyArray<FlatConfig>;
    performance: ReadonlyArray<FlatConfig>;
}>;

/**
 * Legacy helper that builds all config sets from a single plugin object.
 * Prefer `createLintConfigsWithPlugins` when gml/feather plugins differ.
 */
export function createLintConfigs(plugin: LintPluginShape): LintConfigSets {
    return createLintConfigsWithPlugins({
        gmlPlugin: plugin,
        featherPlugin: plugin
    });
}

type LintConfigPluginSet = Readonly<{
    gmlPlugin: LintPluginShape;
    featherPlugin: LintPluginShape;
}>;

export function createLintConfigsWithPlugins(plugins: LintConfigPluginSet): LintConfigSets {
    const recommended: ReadonlyArray<FlatConfig> = Object.freeze([
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
            plugins: Object.freeze({ feather: plugins.featherPlugin }),
            language: "feather/gml",
            rules: RECOMMENDED_RULES
        })
    ]);

    const feather: ReadonlyArray<FlatConfig> = Object.freeze([
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
            plugins: Object.freeze({ feather: plugins.featherPlugin }),
            rules: FEATHER_RULES
        })
    ]);

    const performance: ReadonlyArray<FlatConfig> = Object.freeze([
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
            rules: PERFORMANCE_RULES
        })
    ]);

    return Object.freeze({ recommended, feather, performance });
}
