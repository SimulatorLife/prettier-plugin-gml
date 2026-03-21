import type { Linter } from "eslint";

import { featherLintRules, gmlLintRules } from "../rules/index.js";
import { normalizeLintRulesConfig } from "./project-config.js";

function extractRuleOptionCandidates(config: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(config).filter(([key]) => key !== "fixture" && key !== "lintRules" && key !== "refactor")
    );
}

function resolveRuleSchemaPropertyNames(ruleId: string): ReadonlySet<string> {
    const [pluginId, ruleName] = ruleId.split("/", 2);
    const pluginRules = pluginId === "gml" ? gmlLintRules : pluginId === "feather" ? featherLintRules : {};
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

function extractRuleOptions(config: Record<string, unknown>, ruleId: string): Record<string, unknown> {
    const schemaPropertyNames = resolveRuleSchemaPropertyNames(ruleId);
    if (schemaPropertyNames.size === 0) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(extractRuleOptionCandidates(config)).filter(([key]) => schemaPropertyNames.has(key))
    );
}

/**
 * Build ESLint rule entries from the top-level shared `gmloop.json` object.
 *
 * Rule severities come from `lintRules`, while rule options are sourced from
 * top-level config keys that match the enabled rule schema.
 *
 * @param config Parsed shared project config.
 * @returns ESLint rule entries for all enabled lint rules.
 */
export function createLintRuleEntriesFromProjectConfig(
    config: Record<string, unknown>
): Readonly<Record<string, Linter.RuleEntry>> {
    const normalizedRules = normalizeLintRulesConfig(config);
    const enabledRules = Object.entries(normalizedRules).filter(([, level]) => level !== "off");

    return Object.freeze(
        Object.fromEntries(
            enabledRules.map(([ruleId, level]) => {
                const ruleOptions = extractRuleOptions(config, ruleId);
                return [
                    ruleId,
                    Object.keys(ruleOptions).length > 0 ? ([level, ruleOptions] as Linter.RuleEntry) : level
                ];
            })
        )
    );
}
