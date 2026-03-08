/**
 * Normalize data structure accessor operators only when the access shape makes
 * the current accessor provably invalid.
 *
 * Multi-coordinate structured access can only target grids in GameMaker, so a
 * `MemberIndexExpression` with more than one property entry is safely rewritten
 * to use `[#`.
 */

import { Core, type EmptyTransformOptions, type MutableGameMakerAstNode } from "@gml-modules/core";

const { isObjectLike } = Core;

type MemberIndexNode = {
    type?: string;
    accessor?: string;
    property?: unknown;
    [key: string]: unknown;
};

function shouldNormalizeMemberIndexAccessorToGrid(memberNode: MemberIndexNode): boolean {
    if (memberNode.accessor === "[#") {
        return false;
    }

    return Array.isArray(memberNode.property) && memberNode.property.length > 1;
}

/**
 * Process a single MemberIndexExpression node.
 */
function processMemberIndex(memberNode: MemberIndexNode): void {
    if (shouldNormalizeMemberIndexAccessorToGrid(memberNode)) {
        Reflect.set(memberNode, "accessor", "[#");
    }
}

/**
 * Traverse and normalize accessor operators in the AST.
 */
function visitAndNormalize(node: unknown): void {
    if (Core.shouldSkipTraversal(node)) {
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

    for (const value of Object.values(typedNode)) {
        if (value && typeof value === "object") {
            visitAndNormalize(value);
        }
    }
}

/**
 * Normalize accessor operators in MemberIndexExpression nodes only when the
 * property arity proves grid access is required.
 */
function normalizeAccessors(ast: MutableGameMakerAstNode): void {
    if (!isObjectLike(ast)) {
        return;
    }

    visitAndNormalize(ast);
}

/**
 * Transform that normalizes only syntactically provable grid accessors.
 *
 * This transform intentionally avoids list/map rewrites based on naming
 * conventions because those edits are not semantically safe.
 */
export const normalizeDataStructureAccessorsTransform = Core.createParserTransform<EmptyTransformOptions>(
    "normalize-data-structure-accessors",
    {},
    (ast: MutableGameMakerAstNode) => {
        normalizeAccessors(ast);
        return ast;
    }
);
