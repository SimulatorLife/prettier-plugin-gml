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
    "gml/prefer-loop-length-hoist": "warn",
    "gml/prefer-hoistable-loop-accessors": "warn",
    "gml/prefer-repeat-loops": "warn",
    "gml/prefer-struct-literal-assignments": "warn",
    "gml/optimize-logical-flow": "warn",
    "gml/no-globalvar": "warn",
    "gml/normalize-doc-comments": "warn",
    "gml/normalize-directives": "warn",
    "gml/require-control-flow-braces": "warn",
    "gml/no-assignment-in-condition": "warn",
    "gml/prefer-is-undefined-check": "warn",
    "gml/prefer-epsilon-comparisons": "warn",
    "gml/normalize-operator-aliases": "warn",
    "gml/prefer-string-interpolation": "warn",
    "gml/optimize-math-expressions": "warn",
    "gml/require-argument-separators": "error"
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
 * Creates the immutable lint config sets for the provided plugin object.
 */
export function createLintConfigs(plugin: LintPluginShape): LintConfigSets {
    const recommended: ReadonlyArray<FlatConfig> = Object.freeze([
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
            plugins: Object.freeze({ gml: plugin }),
            language: "gml/gml",
            rules: RECOMMENDED_RULES
        })
    ]);

    const feather: ReadonlyArray<FlatConfig> = Object.freeze([
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
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
