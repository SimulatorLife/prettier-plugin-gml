import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";

type DataStructureConvention = Readonly<{
    accessor: string;
    prefixes: ReadonlyArray<string>;
    suffixes: ReadonlyArray<string>;
    substrings: ReadonlyArray<string>;
}>;

/**
 * Naming-convention rules used to infer the correct GML data-structure accessor.
 * Each entry maps a set of name patterns (prefix, suffix, or substring) to the
 * accessor token that should be used when accessing the data structure.
 */
const DATA_STRUCTURE_CONVENTIONS: ReadonlyArray<DataStructureConvention> = [
    // DS List: [|
    { accessor: "[|", prefixes: ["lst_", "list_"], suffixes: ["_lst", "_list"], substrings: [] },
    // DS Grid: [#
    { accessor: "[#", prefixes: ["grid_"], suffixes: ["_grid"], substrings: ["_grid_"] },
    // DS Map: [?
    { accessor: "[?", prefixes: ["map_"], suffixes: ["_map"], substrings: ["_map_"] }
];

/**
 * Infers the expected GML data-structure accessor token (`[|`, `[?`, or `[#`)
 * from the naming conventions used in the variable name.
 *
 * Naming conventions recognised:
 * - DS List  (`[|`): name starts with `lst_` / `list_`, or ends with `_lst` / `_list`
 * - DS Grid  (`[#`): name starts with `grid_`, ends with `_grid`, or contains `_grid_`
 * - DS Map   (`[?`): name starts with `map_`,  ends with `_map`,  or contains `_map_`
 *
 * Returns `null` when no convention can be determined.
 */
function inferDataStructureAccessor(name: string): string | null {
    const lower = name.toLowerCase();

    for (const convention of DATA_STRUCTURE_CONVENTIONS) {
        if (
            convention.prefixes.some((p) => lower.startsWith(p)) ||
            convention.suffixes.some((s) => lower.endsWith(s)) ||
            convention.substrings.some((sub) => lower.includes(sub))
        ) {
            return convention.accessor;
        }
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
                    const rewrites: Array<{ start: number; end: number; replacement: string }> = [];
                    // Match an identifier followed (with optional spaces) by a DS accessor token.
                    // Group 1: variable name; Group 2: current accessor token.
                    const memberPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(\[\?|\[\||\[#)/g;
                    for (const match of text.matchAll(memberPattern)) {
                        const variableName = match[1] ?? "";
                        const currentAccessor = match[2] ?? "";
                        const expectedAccessor = inferDataStructureAccessor(variableName);

                        if (expectedAccessor === null || currentAccessor === expectedAccessor) {
                            continue;
                        }

                        // Locate the accessor token inside the full match string.
                        const fullMatch = match[0] ?? "";
                        const accessorOffsetInMatch = fullMatch.lastIndexOf(currentAccessor);
                        if (accessorOffsetInMatch === -1) {
                            continue;
                        }

                        const matchStart = match.index ?? 0;
                        const accessorStart = matchStart + accessorOffsetInMatch;
                        const accessorEnd = accessorStart + currentAccessor.length;
                        rewrites.push({ start: accessorStart, end: accessorEnd, replacement: expectedAccessor });
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
