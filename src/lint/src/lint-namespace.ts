import { configs, featherPlugin, plugin } from "./plugin.js";
import { ruleIds } from "./rules/catalog.js";
import { collectProjectAwareRuleIds, renderProjectAwareRulesMarkdown } from "./rules/project-aware-rules-docs.js";
import { services } from "./services/index.js";

export const Lint = Object.freeze({
    plugin,
    featherPlugin,
    configs,
    ruleIds,
    services,
    docs: Object.freeze({
        collectProjectAwareRuleIds,
        renderProjectAwareRulesMarkdown
    })
});
