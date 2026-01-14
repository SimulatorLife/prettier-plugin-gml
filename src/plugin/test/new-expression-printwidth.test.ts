import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Plugin } from "../src/index.js";

void describe("new expression respects printWidth", () => {
    void it("should keep new expression arguments on one line when they fit within printWidth", async () => {
        const input = `collider = new ColmeshColliderCapsule(x, y, z, 0, 0, 1, radius, radius * 2, 0, function(o) {
\tif (instance_exists(o) && o.actor_take_damage_type(damage_type, bonus_damage) && is_destroyed_on_hit) {
\t\tinstance_destroy();
\t}
});`;

        const expected = `collider = new ColmeshColliderCapsule(x, y, z, 0, 0, 1, radius, radius * 2, 0, function(o) {
    if (instance_exists(o) && o.actor_take_damage_type(damage_type, bonus_damage) && is_destroyed_on_hit) {
        instance_destroy();
    }
});`;

        const result = await Plugin.format(input, { printWidth: 106 });

        // The first line should stay together (99 chars < 106 printWidth)
        const resultLines = result.trim().split("\n");
        const expectedLines = expected.trim().split("\n");

        // Check that line 1 matches (the new expression line)
        assert.strictEqual(
            resultLines[0],
            expectedLines[0],
            "New expression should keep arguments on one line when they fit within printWidth"
        );
    });

    void it("should not add space after function keyword in anonymous functions", async () => {
        const input = "var fn = function(x) { return x; };";
        const result = await Plugin.format(input);

        // Should NOT have space after 'function' for anonymous functions
        assert.ok(result.includes("function(x)"), "Anonymous function should not have space after 'function' keyword");
    });
});
