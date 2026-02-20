import type { Rule } from "eslint";

import { featherLintRuleMap, gmlLintRuleMap } from "./catalog.js";

export const gmlLintRules: Record<string, Rule.RuleModule> = gmlLintRuleMap;

export const featherLintRules: Record<string, Rule.RuleModule> = Object.freeze({
    ...gmlLintRuleMap,
    ...featherLintRuleMap
});

export const lintRules: Record<string, Rule.RuleModule> = featherLintRules;
