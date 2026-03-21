import type { GmloopProjectConfig } from "@gmloop/core";

import { LogicalOperatorsStyle } from "./logical-operators-style.js";

const NON_FORMAT_CONFIG_KEYS = new Set(["fixture", "lintRules", "refactor"]);
const NORMALIZE_OPERATOR_ALIASES_RULE_ID = "gml/normalize-operator-aliases";

function hasExplicitLogicalOperatorsStyleOption(options: Record<string, unknown>): boolean {
    return Object.hasOwn(options, "logicalOperatorsStyle");
}

function isNormalizeOperatorAliasesEnabled(config: GmloopProjectConfig): boolean {
    const lintRules = config.lintRules;
    if (!lintRules || typeof lintRules !== "object" || Array.isArray(lintRules)) {
        return false;
    }

    const level = (lintRules as Record<string, unknown>)[NORMALIZE_OPERATOR_ALIASES_RULE_ID];
    return level === "warn" || level === "error";
}

/**
 * Extract formatter-owned options from a shared `gmloop.json` object.
 *
 * @param config Shared top-level project config.
 * @returns Formatter option bag without non-formatter sections.
 */
export function extractProjectFormatOptions(config: GmloopProjectConfig): Record<string, unknown> {
    const options = Object.fromEntries(Object.entries(config).filter(([key]) => !NON_FORMAT_CONFIG_KEYS.has(key)));

    // Keep formatter output consistent with lint normalization when aliases are
    // enforced, unless callers already selected a style explicitly.
    if (!hasExplicitLogicalOperatorsStyleOption(options) && isNormalizeOperatorAliasesEnabled(config)) {
        options.logicalOperatorsStyle = LogicalOperatorsStyle.SYMBOLS;
    }

    return Object.freeze(options);
}
