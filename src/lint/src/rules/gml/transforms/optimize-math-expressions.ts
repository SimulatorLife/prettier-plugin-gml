/**
 * Encourages canonical math expressions so the printer outputs briefly simplified operations via normalization utilities.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

import { createParserTransform } from "./functional-transform.js";
import { applyDivisionToMultiplication } from "./math/division-to-multiplication.js";
import { cleanupMultiplicativeIdentityParentheses } from "./math/parentheses-cleanup.js";
import {
    applyManualMathNormalization,
    applyScalarCondensing,
    type ConvertManualMathTransformOptions,
    normalizeTraversalContext,
    simplifyZeroDivisionNumerators
} from "./math/traversal-normalization.js";

const { isObjectLike } = Core;

function execute(ast: MutableGameMakerAstNode, options: ConvertManualMathTransformOptions): MutableGameMakerAstNode {
    // Drive the composed math normalization helpers in the prescribed order.
    if (!isObjectLike(ast)) {
        return ast;
    }

    const traversalContext = normalizeTraversalContext(ast, options);

    // Apply division to multiplication optimization
    applyDivisionToMultiplication(ast);

    applyManualMathNormalization(ast, traversalContext);
    applyScalarCondensing(ast, traversalContext);
    simplifyZeroDivisionNumerators(ast, traversalContext);
    cleanupMultiplicativeIdentityParentheses(ast, traversalContext);

    return ast;
}

export const optimizeMathExpressionsTransform = createParserTransform<ConvertManualMathTransformOptions>(
    "optimize-math-expressions",
    {},
    execute
);
