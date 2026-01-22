/**
 * Normalize data structure accessor operators based on variable naming conventions.
 *
 * GameMaker Language has different accessor operators for different data structures:
 * - [| - ds_list (list accessor)
 * - [? - ds_map (map accessor)
 * - [# - ds_grid (grid accessor)
 * - [@ - array accessor
 *
 * This transform corrects accessor operators when variable names suggest the wrong operator is being used.
 * For example, `lst_instances[? 0]` should be `lst_instances[| 0]` since the variable name suggests it's a list.
 *
 * SCOPE: This is a simple heuristic-based normalization that infers data structure type from variable names.
 * It does NOT perform full semantic analysis. For more sophisticated type inference, integrate with the
 * semantic analysis module.
 *
 * NAMING CONVENTIONS:
 * - Variables containing "list" or "lst" are assumed to be ds_list and should use [|
 * - Variables containing "map" are assumed to be ds_map and should use [?
 * - Variables containing "grid" are assumed to be ds_grid and should use [#
 */

import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

import type { ParserTransform } from "./functional-transform.js";

type NormalizeDataStructureAccessorsOptions = {
    // Whether to apply accessor normalization. Default is true.
    enabled?: boolean;
};

type MemberIndexNode = {
    type?: string;
    object?: unknown;
    accessor?: string;
    [key: string]: unknown;
};

/**
 * Infer the expected accessor operator from a variable name.
 * Returns the accessor operator string (e.g., "[|", "[?") or null if no inference can be made.
 */
function inferAccessorFromVariableName(name: string): string | null {
    const lowerName = name.toLowerCase();

    // Check for list indicators. GameMaker uses a naming convention where variables
    // holding list data structures often contain "list" or "lst" in their names (e.g.,
    // `enemyList`, `inventoryLst`). This heuristic lets the normalizer infer that
    // accessor operations on these variables should use the list accessor syntax `[|`.
    // Without this inference, the formatter couldn't automatically suggest or apply
    // idiomatic data structure access patterns, leaving developers to manually convert
    // generic function calls to structured accessor syntax.
    if (lowerName.includes("list") || lowerName.includes("lst")) {
        return "[|";
    }

    // Check for map indicators. Variables holding map data structures typically include
    // "map" in their names (e.g., `configMap`, `playerMap`). Detecting this pattern
    // allows the normalizer to recommend the map accessor syntax `[?`, ensuring that
    // map operations use GameMaker's structured accessor notation instead of legacy
    // function-call forms like `ds_map_find_value(myMap, key)`.
    if (lowerName.includes("map")) {
        return "[?";
    }

    // Check for grid indicators. Variables holding grid data structures often contain
    // "grid" in their names (e.g., `terrainGrid`, `gameGrid`). Identifying these lets
    // the normalizer recommend the grid accessor syntax `[#`, promoting consistent use
    // of GameMaker's modern structured access notation for multi-dimensional data.
    if (lowerName.includes("grid")) {
        return "[#";
    }

    return null;
}

/**
 * Process a single MemberIndexExpression node.
 */
function processMemberIndex(memberNode: MemberIndexNode): void {
    const object = memberNode.object;
    if (!object || !Core.isIdentifierNode(object)) {
        return;
    }

    const variableName = Core.getIdentifierName(object);
    if (!variableName) {
        return;
    }

    const expectedAccessor = inferAccessorFromVariableName(variableName);
    if (!expectedAccessor) {
        return;
    }

    const currentAccessor = memberNode.accessor;
    if (typeof currentAccessor !== "string") {
        return;
    }

    if (currentAccessor !== expectedAccessor) {
        memberNode.accessor = expectedAccessor;
    }
}

/**
 * Traverse and normalize accessor operators in the AST.
 */
function visitAndNormalize(node: unknown): void {
    if (!node || typeof node !== "object") {
        return;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            visitAndNormalize(item);
        }
        return;
    }

    const typedNode = node as { type?: string; [key: string]: unknown };

    if (typedNode.type === "MemberIndexExpression") {
        processMemberIndex(typedNode as MemberIndexNode);
    }

    Core.forEachNodeChild(typedNode, (value) => {
        if (value && typeof value === "object") {
            visitAndNormalize(value);
        }
    });
}

/**
 * Normalize accessor operators in MemberIndexExpression nodes based on variable naming conventions.
 */
function normalizeAccessors(ast: MutableGameMakerAstNode): void {
    if (!ast || typeof ast !== "object") {
        return;
    }

    visitAndNormalize(ast);
}

/**
 * Transform that normalizes data structure accessor operators based on variable names.
 */
export class NormalizeDataStructureAccessorsTransform
    implements ParserTransform<MutableGameMakerAstNode, NormalizeDataStructureAccessorsOptions>
{
    public readonly name = "normalize-data-structure-accessors";
    public readonly defaultOptions = Object.freeze({
        enabled: true
    }) as NormalizeDataStructureAccessorsOptions;

    public transform(
        ast: MutableGameMakerAstNode,
        options?: NormalizeDataStructureAccessorsOptions
    ): MutableGameMakerAstNode {
        const opts = { ...this.defaultOptions, ...options };

        if (opts.enabled === false) {
            return ast;
        }

        normalizeAccessors(ast);
        return ast;
    }
}

export const normalizeDataStructureAccessorsTransform = new NormalizeDataStructureAccessorsTransform();
