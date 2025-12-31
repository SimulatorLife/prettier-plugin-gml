import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

/**
 * Targeted test for GM1028 data structure accessor correction.
 *
 * This test verifies that the Feather fix for GM1028 (incorrect data structure
 * accessor) works correctly in formatter-only mode (without preprocessed metadata).
 * The fix should convert incorrect accessor tokens to the correct ones based on
 * the diagnostic's bad/good examples.
 */
void describe("GM1028 data structure accessor fix", () => {
    void it("converts map accessor [?] to list accessor [|]", async () => {
        const input = `lst_instances = ds_list_create();

if (instance_place_list(x, y, obj_enemy, lst_instances, true))
{
    var _ins = lst_instances[? 0];
    show_debug_message(_ins);
}`;

        const expected = `lst_instances = ds_list_create();

if (instance_place_list(x, y, obj_enemy, lst_instances, true)) {
    var _ins = lst_instances[| 0];
    show_debug_message(_ins);
}`;

        const result = await Plugin.format(input, {
            applyFeatherFixes: true
        });

        assert.strictEqual(
            result.trim(),
            expected.trim(),
            "Should convert [?] to [|] for list accessor"
        );
    });

    void it("handles multiple incorrect accessors in the same file", async () => {
        const input = `var list = ds_list_create();
var map = ds_map_create();

ds_list_add(list, 1);
ds_map_set(map, "key", 2);

var a = list[? 0];  // Wrong: should be [|]
var b = list[? 1];  // Wrong: should be [|]
var c = map[| "key"];  // Wrong: should be [?]`;

        const result = await Plugin.format(input, {
            applyFeatherFixes: true
        });

        // At minimum, the list accessors should be fixed
        assert.match(
            result,
            /list\[\|\s*0\]/,
            "Should fix first list accessor"
        );
        assert.match(
            result,
            /list\[\|\s*1\]/,
            "Should fix second list accessor"
        );
    });

    void it("preserves correct accessors", async () => {
        const input = `var list = ds_list_create();
ds_list_add(list, 1);
var value = list[| 0];  // Already correct`;

        const expected = `var list = ds_list_create();
ds_list_add(list, 1);
var value = list[| 0]; // Already correct`;

        const result = await Plugin.format(input, {
            applyFeatherFixes: true
        });

        assert.strictEqual(
            result.trim(),
            expected.trim(),
            "Should preserve already-correct accessor"
        );
    });
});
