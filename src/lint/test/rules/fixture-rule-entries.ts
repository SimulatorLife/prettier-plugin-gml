import type { Linter } from "eslint";

import { Lint } from "../../src/index.js";

function extractFixtureRuleOptionCandidates(config: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(config).filter(([key]) => key !== "fixture" && key !== "lintRules" && key !== "refactor")
    );
}

function resolveFixtureRuleSchemaPropertyNames(ruleId: string): ReadonlySet<string> {
    const [pluginId, ruleName] = ruleId.split("/", 2);
    const pluginRules =
        pluginId === "gml" ? (Lint.plugin.rules ?? {}) : pluginId === "feather" ? (Lint.featherPlugin.rules ?? {}) : {};
    const ruleDefinition = pluginRules[ruleName];
    const schema = ruleDefinition?.meta?.schema;
    if (!Array.isArray(schema) || schema.length === 0) {
        return new Set();
    }

    const firstSchemaEntry = schema[0];
    if (
        !firstSchemaEntry ||
        typeof firstSchemaEntry !== "object" ||
        Array.isArray(firstSchemaEntry) ||
        !("properties" in firstSchemaEntry) ||
        !firstSchemaEntry.properties ||
        typeof firstSchemaEntry.properties !== "object" ||
        Array.isArray(firstSchemaEntry.properties)
    ) {
        return new Set();
    }

    return new Set(Object.keys(firstSchemaEntry.properties as Record<string, unknown>));
}

function extractFixtureRuleOptions(config: Record<string, unknown>, ruleId: string): Record<string, unknown> {
    const schemaPropertyNames = resolveFixtureRuleSchemaPropertyNames(ruleId);
    if (schemaPropertyNames.size === 0) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(extractFixtureRuleOptionCandidates(config)).filter(([key]) => schemaPropertyNames.has(key))
    );
}

/**
 * Build ESLint rule entries from the top-level fixture `gmloop.json`.
 *
 * Rule severity comes from `lintRules`, while rule options are sourced from
 * top-level config keys that match the enabled rule schema.
 *
 * @param config Parsed fixture/project config.
 * @returns ESLint rule entry map for all enabled lint rules.
 */
export function createLintRuleEntriesFromProjectConfig(
    config: Record<string, unknown>
): Record<string, Linter.RuleEntry> {
    const normalizedRules = Lint.normalizeLintRulesConfig(config);
    const enabledRules = Object.entries(normalizedRules).filter(([, level]) => level !== "off");

    return Object.fromEntries(
        enabledRules.map(([ruleId, level]) => {
            const ruleOptions = extractFixtureRuleOptions(config, ruleId);
            return [ruleId, Object.keys(ruleOptions).length > 0 ? ([level, ruleOptions] as Linter.RuleEntry) : level];
        })
    );
}
