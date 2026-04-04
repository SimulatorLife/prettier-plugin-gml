import type { LintPluginShape } from "../plugin.js";
import { featherManifest } from "../rules/feather/manifest.js";
import { PERFORMANCE_OVERRIDE_RULE_IDS } from "./performance-rule-ids.js";

export { normalizeLintRulesConfig } from "./project-config.js";
export { createLintRuleEntriesFromProjectConfig } from "./rule-entries.js";

/**
 * Represents a pinned lint flat-config entry exposed by the lint namespace.
 */
export type FlatConfig = Readonly<{
    files: ReadonlyArray<string>;
    plugins?: Readonly<Record<string, LintPluginShape>>;
    language?: string;
    languageOptions?: Readonly<{
        recovery: "none" | "limited";
    }>;
    rules: Readonly<Record<string, "off" | "warn" | "error">>;
}>;

export const GML_LINT_FILES_GLOB = Object.freeze(["**/*.gml"]);

const RECOMMENDED_RULES = Object.freeze({
    "gml/prefer-hoistable-loop-accessors": "warn",
    "gml/prefer-loop-invariant-expressions": "warn",
    "gml/prefer-repeat-loops": "warn",
    "gml/prefer-struct-literal-assignments": "warn",
    "gml/prefer-array-push": "warn",
    "gml/prefer-compound-assignments": "warn",
    "gml/prefer-increment-decrement-operators": "warn",
    "gml/prefer-direct-return": "warn",
    "gml/optimize-logical-flow": "warn",
    "gml/no-globalvar": "warn",
    "gml/no-empty-regions": "warn",
    "gml/no-legacy-api": "warn",
    "gml/no-scientific-notation": "error",
    "gml/no-unnecessary-string-interpolation": "warn",
    "gml/remove-default-comments": "warn",
    "gml/normalize-doc-comments": "warn",
    "gml/normalize-banner-comments": "warn",
    "gml/normalize-directives": "warn",
    "gml/require-control-flow-braces": "warn",
    "gml/no-assignment-in-condition": "warn",
    "gml/prefer-is-undefined-check": "warn",
    "gml/prefer-epsilon-comparisons": "warn",
    "gml/normalize-operator-aliases": "warn",
    "gml/prefer-string-interpolation": "warn",
    "gml/optimize-math-expressions": "warn",
    "gml/require-argument-separators": "error",
    "gml/normalize-data-structure-accessors": "warn",
    "gml/require-trailing-optional-defaults": "warn",
    "gml/simplify-real-calls": "warn"
});

const RECOMMENDED_SAFE_FEATHER_RULES = Object.freeze({
    "feather/gm1003": "warn",
    "feather/gm1009": "warn",
    "feather/gm1033": "warn",
    "feather/gm1041": "warn",
    "feather/gm2007": "warn",
    "feather/gm2020": "warn"
} satisfies Record<`feather/${string}`, "warn" | "error">);

const FEATHER_RULES: Readonly<Record<`feather/${string}`, "warn" | "error">> = Object.freeze(
    Object.fromEntries(featherManifest.entries.map((entry) => [entry.ruleId, entry.defaultSeverity])) as Record<
        `feather/${string}`,
        "warn" | "error"
    >
);

function createPerformanceRuleSet(): Readonly<Record<string, "off" | "warn" | "error">> {
    const rules: Record<string, "off" | "warn" | "error"> = {
        "gml/prefer-hoistable-loop-accessors": "off",
        "gml/prefer-loop-invariant-expressions": "off",
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
            plugins: Object.freeze({ gml: plugins.gmlPlugin }),
            language: "gml/gml",
            // Keep AST-based lint passes in strict mode by default so malformed
            // code follows the two-tier strategy: tolerant/token-safe fixes first,
            // then AST rules only after a successful parse.
            languageOptions: Object.freeze({ recovery: "none" }),
            rules: RECOMMENDED_RULES
        }),
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
            plugins: Object.freeze({ feather: plugins.featherPlugin }),
            rules: RECOMMENDED_SAFE_FEATHER_RULES
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
