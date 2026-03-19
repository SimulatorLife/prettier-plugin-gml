import { createLintRuleEntriesFromProjectConfig, normalizeLintRulesConfig } from "./configs/index.js";
import { configs, featherPlugin, plugin } from "./plugin.js";
import { ruleIds } from "./rules/catalog.js";
import { services } from "./services/index.js";

export const Lint = Object.freeze({
    plugin,
    featherPlugin,
    configs,
    normalizeLintRulesConfig,
    createLintRuleEntriesFromProjectConfig,
    ruleIds,
    services
});
