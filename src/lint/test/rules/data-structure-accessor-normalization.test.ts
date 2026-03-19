import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Parser } from "@gmloop/parser";

import { collectDataStructureAccessorReplacements } from "../../src/rules/gml/transforms/structs/data-structure-accessor-normalization.js";

function parseProgram(sourceText: string): unknown {
    return Parser.GMLParser.parse(sourceText);
}

void describe("collectDataStructureAccessorReplacements", () => {
    void it("tracks constructor provenance and property arity in source order", () => {
        const programNode = parseProgram(
            [
                "var my_map = ds_map_create();",
                'var value = my_map[| "key"];',
                "var grid = ds_grid_create();",
                "var cell = grid[? 1, 2];",
                ""
            ].join("\n")
        );

        const replacements = collectDataStructureAccessorReplacements(programNode).map(
            ({ replacementAccessor }) => replacementAccessor
        );

        assert.deepEqual(replacements, ["[?", "[#"]);
    });

    void it("drops constructor provenance after reassignment", () => {
        const programNode = parseProgram(
            ["var my_map = ds_map_create();", "my_map = some_value;", 'var value = my_map[| "key"];', ""].join("\n")
        );

        const replacements = collectDataStructureAccessorReplacements(programNode);
        assert.deepEqual(replacements, []);
    });
});
