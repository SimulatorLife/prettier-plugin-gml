import { createLintConfigs } from "./configs/index.js";
import { gmlLanguage } from "./language/index.js";
import { lintRules } from "./rules/index.js";

export type LintPluginShape = {
    rules: Record<string, unknown>;
    languages: Record<string, unknown>;
};

const pluginObject = Object.freeze({
    rules: lintRules,
    languages: Object.freeze({
        gml: gmlLanguage
    })
});

const lintConfigs = createLintConfigs(pluginObject);

export const plugin = pluginObject;
export const configs = lintConfigs;
