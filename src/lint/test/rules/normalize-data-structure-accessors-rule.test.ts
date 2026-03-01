import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

function runNormalizeDataStructureAccessorsRule(code: string): string {
    const rule = LintWorkspace.Lint.plugin.rules["normalize-data-structure-accessors"];
    const fixes: Array<ReplaceTextRangeFixOperation> = [];
    const getLocFromIndex = createLocResolver(code);

    const context = {
        options: [{}],
        sourceCode: {
            text: code,
            getLocFromIndex
        },
        report(payload: {
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
            }) => ReplaceTextRangeFixOperation | null;
        }) {
            if (!payload.fix) {
                return;
            }

            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                }
            };

            const fix = payload.fix(fixer);
            if (fix) {
                fixes.push(fix);
            }
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.({ type: "Program" } as never);

    return applyFixOperations(code, fixes);
}

void describe("normalize-data-structure-accessors corrects mismatched DS accessors via naming conventions", () => {
    void it("corrects list accessor: lst_ prefix with wrong [? accessor", () => {
        const input = "var item = lst_items[? 0];";
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, "var item = lst_items[| 0];");
    });

    void it("corrects map accessor: _map suffix with wrong [| accessor", () => {
        const input = 'var value = my_map[| "key"];';
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, 'var value = my_map[? "key"];');
    });

    void it("corrects grid accessor: _grid suffix with wrong [| accessor", () => {
        const input = "var cell = level_grid[| 1, 2];";
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, "var cell = level_grid[# 1, 2];");
    });

    void it("leaves unknown variable names unchanged", () => {
        const input = "var passthrough = some_var[? 0];";
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, "var passthrough = some_var[? 0];");
    });

    void it("does not modify already-correct list accessor [|", () => {
        const input = "var x = lst_data[| 3];";
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, "var x = lst_data[| 3];");
    });

    void it("does not modify already-correct map accessor [?", () => {
        const input = 'var x = config_map[? "speed"];';
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, 'var x = config_map[? "speed"];');
    });

    void it("does not modify already-correct grid accessor [#", () => {
        const input = "var x = tile_grid[# 0, 1];";
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, "var x = tile_grid[# 0, 1];");
    });

    void it("corrects list_ prefix with wrong [? accessor", () => {
        const input = "var elem = list_enemies[? 2];";
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, "var elem = list_enemies[| 2];");
    });

    void it("corrects _lst suffix with wrong [# accessor", () => {
        const input = "var elem = items_lst[# 2];";
        const output = runNormalizeDataStructureAccessorsRule(input);
        assert.equal(output, "var elem = items_lst[| 2];");
    });
});
