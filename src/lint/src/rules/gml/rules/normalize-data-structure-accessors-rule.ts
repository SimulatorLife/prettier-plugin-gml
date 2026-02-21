import type { Rule } from "eslint";
import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";

export function createNormalizeDataStructureAccessorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const rewrites: Array<{ start: number; end: number; replacement: string }> = [];
                    const memberPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(\[\?|\[\||\[#)\s*/g;
                    for (const match of text.matchAll(memberPattern)) {
                        const variableName = match[1];
                        const accessor = match[2];
                        const lowerName = (variableName ?? "").toLowerCase();

                        if (
                            (accessor === "[?" && (lowerName === "ds_map_find_value" || lowerName === "ds_map_find_next")) ||
                            (accessor === "[|" && lowerName === "ds_list_find_value") ||
                            (accessor === "[#" && lowerName === "ds_grid_get")
                        ) {
                            const start = match.index ?? 0;
                            const end = start + (match[0]?.length ?? 0);
                            rewrites.push({ start, end, replacement: accessor });
                        }
                    }

                    for (const rewrite of rewrites.toReversed()) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(rewrite.start),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([rewrite.start, rewrite.end], rewrite.replacement)
                        });
                    }
                }
            });
        }
    });
}
