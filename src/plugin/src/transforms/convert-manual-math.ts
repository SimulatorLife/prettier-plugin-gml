import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";
import { cleanupMultiplicativeIdentityParentheses } from "./math/parentheses-cleanup.js";
import {
    applyManualMathNormalization,
    normalizeTraversalContext,
    type ConvertManualMathTransformOptions
} from "./math/traversal-normalization.js";
import { applyScalarCondensing } from "./math/scalar-condensing.js";

function convertManualMathExpressionsImpl(
    ast: any,
    context: ConvertManualMathTransformOptions | null = null
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const traversalContext = normalizeTraversalContext(ast, context);

    applyManualMathNormalization(ast, traversalContext);
    cleanupMultiplicativeIdentityParentheses(ast, traversalContext);

    return ast;
}

function condenseScalarMultipliersImpl(
    ast: any,
    context: ConvertManualMathTransformOptions | null = null
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const traversalContext = normalizeTraversalContext(ast, context);

    applyScalarCondensing(ast, traversalContext);
    cleanupMultiplicativeIdentityParentheses(ast, traversalContext);

    return ast;
}

export class ConvertManualMathExpressionsTransform extends FunctionalParserTransform<ConvertManualMathTransformOptions> {
    constructor() {
        super("convert-manual-math", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        options: ConvertManualMathTransformOptions
    ): MutableGameMakerAstNode {
        return convertManualMathExpressionsImpl(ast, options);
    }
}

export const convertManualMathExpressionsTransform =
    new ConvertManualMathExpressionsTransform();

export class CondenseScalarMultipliersTransform extends FunctionalParserTransform<ConvertManualMathTransformOptions> {
    constructor() {
        super("condense-scalar-multipliers", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        options: ConvertManualMathTransformOptions
    ): MutableGameMakerAstNode {
        return condenseScalarMultipliersImpl(ast, options);
    }
}

export const condenseScalarMultipliersTransform =
    new CondenseScalarMultipliersTransform();

