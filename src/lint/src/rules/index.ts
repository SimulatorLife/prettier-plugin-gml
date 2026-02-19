import { featherLintRuleMap, gmlLintRuleMap, lintRuleMap } from "./catalog.js";

export const gmlLintRules = Object.freeze({
    ...gmlLintRuleMap
});

export const featherLintRules = Object.freeze({
    ...featherLintRuleMap
});

export const lintRules = Object.freeze({
    ...lintRuleMap
});
