import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";
import { cleanupMultiplicativeIdentityParentheses } from "./math/parentheses-cleanup.js";
import {
    applyManualMathNormalization,
    normalizeTraversalContext,
    applyScalarCondensing,
    type ConvertManualMathTransformOptions
} from "./math/traversal-normalization.js";

const { BINARY_EXPRESSION, LITERAL } = Core;

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
        this.attemptConvertDivisionToMultiplication(node);

        // Recurse
        for (const key in node) {
            // Skip parent references to avoid cycles
            if (key === "parent") continue;

            const child = (node as any)[key];
            if (Array.isArray(child)) {
                for (const item of child) {
                    this.applyDivisionToMultiplication(item);
                }
            } else if (child && typeof child === "object") {
                this.applyDivisionToMultiplication(child);
            }
        }
    }

    /**
     * Converts division by a constant literal into multiplication by its reciprocal.
     * Example: `x / 2` -> `x * 0.5`
     */
    private attemptConvertDivisionToMultiplication(
        node: MutableGameMakerAstNode
    ): boolean {
        if (node.type !== BINARY_EXPRESSION || node.operator !== "/") {
            return false;
        }

        const right = node.right;
        // Ensure we are dividing by a numeric literal
        if (right.type !== LITERAL || typeof right.value !== "number") {
            return false;
        }

        const divisor = right.value;
        if (divisor === 0) {
            return false; // Avoid division by zero issues
        }

        // Calculate reciprocal
        const reciprocal = 1 / divisor;

        // Mutate the node
        node.operator = "*";
        node.right = {
            ...right,
            value: reciprocal,
            raw: String(reciprocal)
        };

        return true;
    }
}

export const optimizeMathExpressionsTransform =
    new OptimizeMathExpressionsTransform();
