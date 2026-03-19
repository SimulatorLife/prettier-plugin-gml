/**
 * Normalize data structure accessor operators only when the access shape makes
 * the current accessor provably invalid.
 *
 * Multi-coordinate structured access can only target grids in GameMaker, so a
 * `MemberIndexExpression` with more than one property entry is rewritten to use
 * `[#` because that arity proves grid access.
 */

import { Core, type EmptyTransformOptions, type MutableGameMakerAstNode } from "@gmloop/core";

import { collectDataStructureAccessorReplacements } from "./data-structure-accessor-normalization.js";

/**
 * Traverse and normalize accessor operators in the AST.
 */
function visitAndNormalize(node: unknown): void {
    for (const { node: memberIndexNode, replacementAccessor } of collectDataStructureAccessorReplacements(node)) {
        Reflect.set(memberIndexNode, "accessor", replacementAccessor);
    }
}

/**
 * Normalize accessor operators in MemberIndexExpression nodes only when the
 * property arity proves grid access is required.
 */
function normalizeAccessors(ast: MutableGameMakerAstNode): void {
    if (!Core.isObjectLike(ast)) {
        return;
    }

    visitAndNormalize(ast);
}

/**
 * Transform that normalizes only syntactically provable grid accessors.
 *
 * This transform intentionally avoids list/map rewrites based on naming
 * conventions because names alone do not provide enough evidence.
 */
export const normalizeDataStructureAccessorsTransform = Core.createParserTransform<EmptyTransformOptions>(
    "normalize-data-structure-accessors",
    {},
    (ast: MutableGameMakerAstNode) => {
        normalizeAccessors(ast);
        return ast;
    }
);
