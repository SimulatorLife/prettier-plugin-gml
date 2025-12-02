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

class ConvertManualMathExpressionsTransform extends FunctionalParserTransform<ConvertManualMathTransformOptions> {
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

const convertManualMathExpressionsTransform =
    new ConvertManualMathExpressionsTransform();

export function convertManualMathExpressions(
    ast: any,
    context: ConvertManualMathTransformOptions | null = null
) {
    return convertManualMathExpressionsTransform.transform(ast, context);
}

export function condenseScalarMultipliers(
    ast: any,
    context: ConvertManualMathTransformOptions | null = null
) {
    return condenseScalarMultipliersImpl(ast, context);
}
