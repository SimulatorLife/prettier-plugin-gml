import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";
import { cleanupMultiplicativeIdentityParentheses } from "./math/parentheses-cleanup.js";
import {
    applyManualMathNormalization,
    normalizeTraversalContext,
    type ConvertManualMathTransformOptions
} from "./math/traversal-normalization.js";
import { applyScalarCondensing } from "./math/scalar-condensing.js";
import { attemptConvertDivisionToMultiplication } from "./math/division-to-multiplication.js";

export class OptimizeMathExpressionsTransform extends FunctionalParserTransform<ConvertManualMathTransformOptions> {
    constructor() {
        super("optimize-math-expressions", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        options: ConvertManualMathTransformOptions
    ): MutableGameMakerAstNode {
        if (!ast || typeof ast !== "object") {
            return ast;
        }

        const traversalContext = normalizeTraversalContext(ast, options);

        // Apply division to multiplication optimization
        this.applyDivisionToMultiplication(ast);

        applyManualMathNormalization(ast, traversalContext);
        applyScalarCondensing(ast, traversalContext);
        cleanupMultiplicativeIdentityParentheses(ast, traversalContext);

        return ast;
    }

    private applyDivisionToMultiplication(node: MutableGameMakerAstNode) {
        if (!node || typeof node !== "object") {
            return;
        }

        // Apply transform
        attemptConvertDivisionToMultiplication(node);

        // Recurse
        for (const key in node) {
            // Skip parent references to avoid cycles
            if (key === "parent") continue;

            const child = (node as any)[key];
            if (Array.isArray(child)) {
                child.forEach((c) => this.applyDivisionToMultiplication(c));
            } else if (child && typeof child === "object" && child.type) {
                this.applyDivisionToMultiplication(child);
            }
        }
    }
}

export const optimizeMathExpressionsTransform =
    new OptimizeMathExpressionsTransform();
