import type { Rule } from "eslint";
import { featherLintRuleMap, gmlLintRuleMap, lintRuleMap } from "./catalog.js";

export const gmlLintRules: Record<string, Rule.RuleModule> = Object.freeze({});

export const featherLintRules: Record<string, Rule.RuleModule> = Object.freeze({
    ...gmlLintRuleMap,
    ...featherLintRuleMap
});

export const lintRules: Record<string, Rule.RuleModule> = Object.freeze({
    ...featherLintRules
});
