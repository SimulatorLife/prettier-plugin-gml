import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";

const DS_FUNCTION_ACCESSOR_MAP: ReadonlyMap<string, string> = new Map([
    ["ds_list_find_value", "[|"],
    ["ds_map_find_value", "[?"],
    ["ds_map_find_next", "[?"],
    ["ds_grid_get", "[#"]
]);

/**
 * Infers the expected DS accessor based on common GML variable naming conventions.
 * Returns null if no convention applies (expression is left unchanged).
 */
function inferExpectedAccessorFromName(lowerName: string): string | null {
    if (lowerName.startsWith("lst_") || lowerName.endsWith("_list") || lowerName.endsWith("_lst")) {
        return "[|";
    }

    if (lowerName.endsWith("_map") || lowerName.startsWith("map_") || lowerName.includes("_map_")) {
        return "[?";
    }

    if (lowerName.endsWith("_grid") || lowerName.startsWith("grid_") || lowerName.includes("_grid_")) {
        return "[#";
    }

    // Whole-word "map" or "grid" suffix at word boundary (e.g. "my_map", "level_grid")
    if (/(?:^|_)map$/u.test(lowerName)) {
        return "[?";
    }

    if (/(?:^|_)grid$/u.test(lowerName)) {
        return "[#";
    }

    return null;
}

export function createNormalizeDataStructureAccessorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const rewrites: Array<{ accessorStart: number; accessorEnd: number; replacement: string }> = [];
                    const memberPattern = /\b([A-Za-z_][A-Za-z0-9_]*)(\s*)(\[\?|\[\||\[#)/g;
                    for (const match of text.matchAll(memberPattern)) {
                        const variableName = match[1] ?? "";
                        const whitespaceBefore = match[2] ?? "";
                        const accessor = match[3] ?? "";
                        const lowerName = variableName.toLowerCase();

                        const matchStart = match.index ?? 0;
                        // The accessor starts after the variable name and whitespace before it
                        const accessorStart = matchStart + variableName.length + whitespaceBefore.length;
                        const accessorEnd = accessorStart + accessor.length;

                        const expectedAccessorFromDsFunc = DS_FUNCTION_ACCESSOR_MAP.get(lowerName);
                        const expectedAccessorFromConvention = inferExpectedAccessorFromName(lowerName);
                        const expectedAccessor = expectedAccessorFromDsFunc ?? expectedAccessorFromConvention;

                        if (expectedAccessor !== null && accessor !== expectedAccessor) {
                            rewrites.push({ accessorStart, accessorEnd, replacement: expectedAccessor });
                        }
                    }

                    for (const rewrite of rewrites.toReversed()) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(rewrite.accessorStart),
                            messageId: definition.messageId,
                            fix: (fixer) =>
                                fixer.replaceTextRange(
                                    [rewrite.accessorStart, rewrite.accessorEnd],
                                    rewrite.replacement
                                )
                        });
                    }
                }
            });
        }
    });
}
