import {
    hasComment as sharedHasComment,
    toTrimmedString,
    cloneAstNode,
    visitChildNodes,
    unwrapParenthesizedExpression
} from "../shared/index.js";

const DEFAULT_HELPERS = Object.freeze({
    hasComment: sharedHasComment
});

const MULTIPLY = "*";
const DIVIDE = "/";

/**
 * Collapse numeric factors in simple multiplication/division chains.
 *
 * The transformation intentionally targets the smallest failing surface area
 * from the math fixture: expressions where a single non-numeric operand is
 * multiplied and divided by literal constants. More complex scenarios (such as
 * parentheses around additional expressions or multiple symbolic operands)
 * continue to fall back to the existing behaviour so the change stays narrowly
 * scoped.
 *
 * @param {unknown} ast Parsed AST to normalize in place.
 * @param {{ hasComment?: (node: unknown) => boolean }} helpers Optional
 *        comment helpers that mirror the shared comment utilities.
 * @returns {unknown} The original AST reference for chaining.
 */
export function simplifyMultiplicativeConstantChains(
    ast,
    helpers = DEFAULT_HELPERS
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const normalizedHelpers = normalizeHelpers(helpers);

    visit(ast);

    return ast;

    function visit(node) {
        if (!node || typeof node !== "object") {
            return;
        }

        if (node.type === "BinaryExpression") {
            attemptSimplifyMultiplicativeChain(node, normalizedHelpers);
        }

        visitChildNodes(node, visit);
    }
}

function normalizeHelpers(helpers) {
    if (!helpers || typeof helpers !== "object") {
        return DEFAULT_HELPERS;
    }

    const normalized = {
        ...DEFAULT_HELPERS
    };

    if (typeof helpers.hasComment === "function") {
        normalized.hasComment = helpers.hasComment;
    }

    return normalized;
}

function attemptSimplifyMultiplicativeChain(node, helpers) {
    if (!node || node.type !== "BinaryExpression") {
        return false;
    }

    if (node.operator !== MULTIPLY && node.operator !== DIVIDE) {
        return false;
    }

    if (helpers.hasComment(node)) {
        return false;
    }

    const analysis = analyzeMultiplicativeExpression(node, helpers);
    if (!analysis) {
        return false;
    }

    const { coefficient, operand } = analysis;

    if (!operand) {
        return false;
    }

    if (!Number.isFinite(coefficient)) {
        return false;
    }

    if (Math.abs(coefficient) < 1e-15) {
        return false;
    }

    if (Math.abs(coefficient - 1) <= 1e-12) {
        return false;
    }

    const literalText = formatNumericLiteral(coefficient);
    if (!literalText) {
        return false;
    }

    const literalNode = { type: "Literal", value: literalText };

    replaceNodeContents(node, {
        type: "BinaryExpression",
        operator: MULTIPLY,
        left: cloneAstNode(operand),
        right: literalNode
    });

    return true;
}

function formatNumericLiteral(value) {
    if (!Number.isFinite(value)) {
        return null;
    }

    if (Object.is(value, -0)) {
        value = 0;
    }

    let text = value.toFixed(15);
    text = text.replace(/0+$/, "");

    if (text.endsWith(".")) {
        text = text.slice(0, -1);
    }

    if (text === "" || text === "-") {
        return "0";
    }

    if (text === "-0") {
        return "0";
    }

    return text;
}

function replaceNodeContents(target, replacement) {
    for (const key of Object.keys(target)) {
        delete target[key];
    }

    for (const [key, value] of Object.entries(replacement)) {
        target[key] = value;
    }
}

function analyzeMultiplicativeExpression(node, helpers) {
    if (!node || typeof node !== "object") {
        return null;
    }

    const unwrapped = unwrapParenthesizedExpression(node);
    if (!unwrapped || typeof unwrapped !== "object") {
        return null;
    }

    if (helpers.hasComment(unwrapped)) {
        return null;
    }

    switch (unwrapped.type) {
        case "Literal": {
            const text = toTrimmedString(unwrapped.value);
            if (text === "") {
                return null;
            }

            const numericValue = Number(text);
            return Number.isFinite(numericValue)
                ? { coefficient: numericValue, operand: null }
                : null;
        }
        case "Identifier":
        case "MemberDotExpression":
        case "MemberIndexExpression": {
            return { coefficient: 1, operand: unwrapped };
        }
        case "UnaryExpression": {
            if (unwrapped.operator !== "+" && unwrapped.operator !== "-") {
                return null;
            }

            const analysis = analyzeMultiplicativeExpression(
                unwrapped.argument,
                helpers
            );
            if (!analysis) {
                return null;
            }

            const signedCoefficient =
                unwrapped.operator === "-"
                    ? -analysis.coefficient
                    : analysis.coefficient;

            return {
                coefficient: signedCoefficient,
                operand: analysis.operand
            };
        }
        case "BinaryExpression": {
            const operator = unwrapped.operator;
            if (operator !== MULTIPLY && operator !== DIVIDE) {
                return null;
            }

            const left = analyzeMultiplicativeExpression(
                unwrapped.left,
                helpers
            );
            if (!left) {
                return null;
            }

            const right = analyzeMultiplicativeExpression(
                unwrapped.right,
                helpers
            );
            if (!right) {
                return null;
            }

            if (operator === MULTIPLY) {
                if (left.operand && right.operand) {
                    return null;
                }

                return {
                    coefficient: left.coefficient * right.coefficient,
                    operand: left.operand ?? right.operand
                };
            }

            if (right.operand) {
                return null;
            }

            if (right.coefficient === 0) {
                return null;
            }

            return {
                coefficient: left.coefficient / right.coefficient,
                operand: left.operand
            };
        }
        default: {
            return null;
        }
    }
}
