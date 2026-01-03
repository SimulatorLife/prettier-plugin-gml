/**
 * Removes redundant parentheses around multiplicative identities introduced during manual math formatting.
 * This cleanup keeps expressions concise for the printer while respecting structural safety rules.
 */
import { Core } from "@gml-modules/core";
import {
    attemptCondenseScalarProduct,
    attemptCondenseSimpleScalarProduct,
    isIdentityReplacementSafeExpression,
    replaceNodeWith,
    type ConvertManualMathTransformOptions
} from "./traversal-normalization.js";

const { BINARY_EXPRESSION, PARENTHESIZED_EXPRESSION, UNARY_EXPRESSION } = Core;

/**
 * Recursively remove parentheses inserted around multiplicative identity expressions when safe.
 */
export function cleanupMultiplicativeIdentityParentheses(
    node,
    context: ConvertManualMathTransformOptions | null,
    parent = null
) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (node._gmlManualMathOriginal === true) {
        return;
    }

    if (Array.isArray(node)) {
        for (const element of node) {
            cleanupMultiplicativeIdentityParentheses(element, context, parent);
        }
        return;
    }

    if (
        node.type === PARENTHESIZED_EXPRESSION &&
        node.expression &&
        typeof node.expression === "object" &&
        node.expression.__fromMultiplicativeIdentity === true &&
        isIdentityReplacementSafeExpression(node.expression) &&
        !shouldPreserveIdentityParenthesesForAncestor(parent) &&
        replaceNodeWith(node, node.expression)
    ) {
        node.__fromMultiplicativeIdentity = true;
        cleanupMultiplicativeIdentityParentheses(node, context, parent);
        return;
    }

    for (const value of Object.values(node)) {
        if (!value || typeof value !== "object") {
            continue;
        }

        if (Array.isArray(value)) {
            for (const element of value) {
                cleanupMultiplicativeIdentityParentheses(element, context, node);
            }
        } else {
            cleanupMultiplicativeIdentityParentheses(value, context, node);
        }
    }

    if (node.type === BINARY_EXPRESSION && !attemptCondenseScalarProduct(node, context)) {
        attemptCondenseSimpleScalarProduct(node, context);
    }
}

/**
 * Certain ancestors (modulo, logical negation) must keep their defending parentheses so semantics stays stable.
 */
function shouldPreserveIdentityParenthesesForAncestor(ancestor) {
    if (!ancestor || typeof ancestor !== "object") {
        return false;
    }

    if (ancestor.type === BINARY_EXPRESSION) {
        const operator = String(ancestor.operator ?? "").toLowerCase();

        if (operator === "mod" || operator === "%") {
            return true;
        }
    }

    if (ancestor.type === UNARY_EXPRESSION) {
        const operator = ancestor.operator;

        if (operator === "!" || operator === "not") {
            // GML does not support the operator 'not'; this is included to automatic fixing
            return true;
        }
    }

    return false;
}
