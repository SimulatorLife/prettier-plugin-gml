import type { Rule } from "eslint";

import { lintRules } from "./index.js";

type RuleModuleWithMeta = Rule.RuleModule & {
    meta?: {
        docs?: {
            requiresProjectContext?: boolean;
        };
    };
};

/**
 * Collect the canonical full rule IDs that require project context according to
 * `meta.docs.requiresProjectContext`.
 */
export function collectProjectAwareRuleIds(): ReadonlyArray<string> {
    const projectAwareRuleIds: string[] = [];

    for (const [shortName, module] of Object.entries(lintRules)) {
        const typedModule = module as RuleModuleWithMeta;
        if (typedModule.meta?.docs?.requiresProjectContext === true) {
            if (shortName.startsWith("gm")) {
                projectAwareRuleIds.push(`feather/${shortName}`);
                continue;
            }

            projectAwareRuleIds.push(`gml/${shortName}`);
        }
    }

    projectAwareRuleIds.sort((left, right) => left.localeCompare(right));
    return Object.freeze(projectAwareRuleIds);
}

/**
 * Render a markdown list suitable for publication in repository docs.
 */
export function renderProjectAwareRulesMarkdown(): string {
    const ruleIds = collectProjectAwareRuleIds();
    const lines = [
        "# Project-aware lint rules",
        "",
        "This file is auto-generated from `meta.docs.requiresProjectContext` in `@gml-modules/lint`.",
        "",
        `Total rules: ${ruleIds.length}`,
        ""
    ];

    for (const ruleId of ruleIds) {
        lines.push(`- \`${ruleId}\``);
    }

    lines.push("");
    return lines.join("\n");
}
