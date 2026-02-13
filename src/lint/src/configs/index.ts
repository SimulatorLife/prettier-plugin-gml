import type { LintPluginShape } from "../plugin.js";
import { featherManifest } from "../rules/feather/manifest.js";
import { PERFORMANCE_OVERRIDE_RULE_IDS } from "./performance-rule-ids.js";

export const GML_LINT_FILES_GLOB = Object.freeze(["**/*.gml"]);

function createRecommendedRules() {
    return Object.freeze({
        "gml/prefer-loop-length-hoist": "warn",
        "gml/prefer-hoistable-loop-accessors": "warn",
        "gml/prefer-struct-literal-assignments": "warn",
        "gml/optimize-logical-flow": "warn",
        "gml/no-globalvar": "warn",
        "gml/normalize-doc-comments": "warn",
        "gml/prefer-string-interpolation": "warn",
        "gml/optimize-math-expressions": "warn",
        "gml/require-argument-separators": "error"
    });
}

function createFeatherRules() {
    const rules: Record<string, "warn" | "error"> = {};
    for (const entry of featherManifest.entries) {
        rules[entry.ruleId] = entry.defaultSeverity;
    }

    return Object.freeze(rules);
}

function createPerformanceRules() {
    const rules: Record<string, "off" | "warn" | "error"> = {
        ["gml/prefer-loop-length-hoist"]: "off",
        ["gml/prefer-struct-literal-assignments"]: "off",
        ["gml/no-globalvar"]: "warn",
        ["gml/prefer-string-interpolation"]: "off"
    };

    for (const ruleId of PERFORMANCE_OVERRIDE_RULE_IDS) {
        if (!(ruleId in rules)) {
            rules[ruleId] = "off";
        }
    }

    return Object.freeze(rules);
}

export function createLintConfigs(plugin: LintPluginShape) {
    const recommended = Object.freeze([
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
            plugins: Object.freeze({ gml: plugin }),
            language: "gml/gml",
            rules: createRecommendedRules()
        })
    ]);

    const feather = Object.freeze([
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
            rules: createFeatherRules()
        })
    ]);

    const performance = Object.freeze([
        Object.freeze({
            files: GML_LINT_FILES_GLOB,
            rules: createPerformanceRules()
        })
    ]);

    return Object.freeze({
        recommended,
        feather,
        performance
    });
}
