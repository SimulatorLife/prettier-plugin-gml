import {
    hasComment as sharedHasComment,
    normalizeHasCommentHelpers
} from "../comments/index.js";
import { assignClonedLocation, cloneAstNode } from "../shared/index.js";

const DEFAULT_HELPERS = Object.freeze({
    hasComment: sharedHasComment
});

const BINARY_EXPRESSION = "BinaryExpression";
const IDENTIFIER = "Identifier";
const LITERAL = "Literal";
const MEMBER_DOT_EXPRESSION = "MemberDotExpression";
const MEMBER_INDEX_EXPRESSION = "MemberIndexExpression";
const PARENTHESIZED_EXPRESSION = "ParenthesizedExpression";
const UNARY_EXPRESSION = "UnaryExpression";

export function simplifyMultiplicativeConstants(
    ast,
    helpers = DEFAULT_HELPERS
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const normalizedHelpers = normalizeHasCommentHelpers(helpers);
    traverse(ast, normalizedHelpers, new Set());
    return ast;
}

function traverse(node, helpers, seen) {
    if (!node || typeof node !== "object" || seen.has(node)) {
        return;
    }

    seen.add(node);

    if (Array.isArray(node)) {
        for (const element of node) {
            traverse(element, helpers, seen);
        }
        return;
    }

    if (node.type === BINARY_EXPRESSION) {
        let changed = true;
        while (changed) {
            changed = simplifyMultiplicativeChain(node, helpers);
        }
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            traverse(value, helpers, seen);
        }
    }
}

function simplifyMultiplicativeChain(node, helpers) {
    if (!isMultiplicativeOperator(node.operator) || helpers.hasComment(node)) {
        return false;
    }

    const terms = [];
    if (!collectMultiplicativeTerms(node, helpers, terms)) {
        return false;
    }

    let coefficient = 1;
    let hasNumeric = false;
    const baseOperands = [];

    for (const term of terms) {
        const { node: operand, divide } = term;

        if (helpers.hasComment(operand)) {
            return false;
        }

        const numericValue = evaluateNumericExpression(operand);

        if (numericValue == null) {
            if (divide) {
                return false;
            }

            baseOperands.push(operand);

            if (baseOperands.length > 1) {
                return false;
            }

            continue;
        }

        if (divide) {
            if (numericValue === 0) {
                return false;
            }

            coefficient /= numericValue;
        } else {
            coefficient *= numericValue;
        }

        hasNumeric = true;
    }

    if (!hasNumeric) {
        return false;
    }

    const normalizedCoefficient = normalizeCoefficient(coefficient);

    if (normalizedCoefficient == null) {
        return false;
    }

    const replacement = buildReplacement(
        baseOperands,
        normalizedCoefficient,
        node
    );

    if (!replacement) {
        return false;
    }

    return replaceNode(node, replacement);
}

function collectMultiplicativeTerms(node, helpers, output) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return false;
    }

    if (expression.type !== BINARY_EXPRESSION) {
        output.push({ node: expression, divide: false });
        return true;
    }

    if (!isMultiplicativeOperator(expression.operator)) {
        output.push({ node: expression, divide: false });
        return true;
    }

    if (helpers.hasComment(expression)) {
        return false;
    }

    if (!collectMultiplicativeTerms(expression.left, helpers, output)) {
        return false;
    }

    const right = unwrapExpression(expression.right);
    if (!right) {
        return false;
    }

    if (expression.operator === "/") {
        if (helpers.hasComment(expression.right)) {
            return false;
        }

        output.push({ node: right, divide: true });
        return true;
    }

    return collectMultiplicativeTerms(right, helpers, output);
}

function buildReplacement(baseOperands, coefficient, template) {
    if (baseOperands.length === 0) {
        return createNumericLiteral(coefficient, template);
    }

    const [baseOperand] = baseOperands;
    let baseClone = cloneAstNode(baseOperand);

    if (shouldParenthesizeBase(baseClone)) {
        baseClone = createParenthesizedExpression(baseClone, template);
    }

    if (coefficient === 1) {
        return baseClone;
    }

    if (coefficient === -1) {
        return createUnaryExpression("-", baseClone, template);
    }

    const literal = createNumericLiteral(coefficient, template);
    if (!literal) {
        return null;
    }

    const product = {
        type: BINARY_EXPRESSION,
        operator: "*",
        left: baseClone,
        right: literal
    };

    assignClonedLocation(product, template);
    return product;
}

function createUnaryExpression(operator, argument, template) {
    if (!argument || typeof argument !== "object") {
        return null;
    }

    const expression = {
        type: UNARY_EXPRESSION,
        operator,
        prefix: true,
        argument
    };

    assignClonedLocation(expression, template);
    return expression;
}

function replaceNode(target, replacement) {
    if (
        !replacement ||
        typeof replacement !== "object" ||
        nodesAreEquivalent(target, replacement)
    ) {
        return false;
    }

    for (const key of Object.keys(target)) {
        delete target[key];
    }

    Object.assign(target, replacement);
    return true;
}

function normalizeCoefficient(value) {
    if (!Number.isFinite(value)) {
        return null;
    }

    if (Object.is(value, -0)) {
        return 0;
    }

    return value;
}

function isMultiplicativeOperator(operator) {
    if (typeof operator !== "string") {
        return false;
    }

    const normalized = operator.toLowerCase();
    return normalized === "*" || normalized === "/";
}

function evaluateNumericExpression(node) {
    const expression = unwrapExpression(node);

    if (!expression) {
        return null;
    }

    switch (expression.type) {
        case LITERAL: {
            return parseNumericLiteral(expression);
        }
        case UNARY_EXPRESSION: {
            if (expression.operator === "+") {
                return evaluateNumericExpression(expression.argument);
            }

            if (expression.operator === "-") {
                const value = evaluateNumericExpression(expression.argument);
                return value == null ? null : -value;
            }

            return null;
        }
        case BINARY_EXPRESSION: {
            const leftValue = evaluateNumericExpression(expression.left);
            const rightValue = evaluateNumericExpression(expression.right);

            if (leftValue == null || rightValue == null) {
                return null;
            }

            switch (expression.operator) {
                case "+": {
                    return leftValue + rightValue;
                }
                case "-": {
                    return leftValue - rightValue;
                }
                case "*": {
                    return leftValue * rightValue;
                }
                case "/": {
                    return rightValue === 0 ? null : leftValue / rightValue;
                }
                default: {
                    return null;
                }
            }
        }
        default: {
            return null;
        }
    }
}

function parseNumericLiteral(node) {
    if (!node || node.type !== LITERAL) {
        return null;
    }

    const raw = node.value;

    if (typeof raw === "number") {
        return Number.isFinite(raw) ? raw : null;
    }

    if (typeof raw === "string") {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function createNumericLiteral(value, template) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const literal = {
        type: LITERAL,
        value: String(value)
    };

    assignClonedLocation(literal, template);
    return literal;
}

function unwrapExpression(node) {
    let current = node;

    while (
        current &&
        typeof current === "object" &&
        current.type === PARENTHESIZED_EXPRESSION &&
        current.expression
    ) {
        current = current.expression;
    }

    return current ?? null;
}

function shouldParenthesizeBase(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type !== BINARY_EXPRESSION) {
        return false;
    }

    const operator =
        typeof node.operator === "string" ? node.operator.toLowerCase() : "";

    return operator === "+" || operator === "-";
}

function createParenthesizedExpression(expression, template) {
    if (!expression || typeof expression !== "object") {
        return null;
    }

    const wrapped = {
        type: PARENTHESIZED_EXPRESSION,
        expression
    };

    assignClonedLocation(wrapped, template);
    return wrapped;
}

function nodesAreEquivalent(a, b) {
    if (a === b) {
        return true;
    }

    if (!a || !b || a.type !== b.type) {
        return false;
    }

    switch (a.type) {
        case LITERAL: {
            const leftValue = parseNumericLiteral(a);
            const rightValue = parseNumericLiteral(b);

            if (leftValue == null || rightValue == null) {
                return a.value === b.value;
            }

            return Object.is(leftValue, rightValue);
        }
        case IDENTIFIER: {
            return a.name === b.name;
        }
        case UNARY_EXPRESSION: {
            return (
                a.operator === b.operator &&
                nodesAreEquivalent(a.argument, b.argument)
            );
        }
        case PARENTHESIZED_EXPRESSION: {
            return nodesAreEquivalent(a.expression, b.expression);
        }
        case MEMBER_DOT_EXPRESSION: {
            return (
                nodesAreEquivalent(a.object, b.object) &&
                nodesAreEquivalent(a.property, b.property)
            );
        }
        case MEMBER_INDEX_EXPRESSION: {
            if (!Array.isArray(a.property) || !Array.isArray(b.property)) {
                return false;
            }

            if (a.property.length !== b.property.length) {
                return false;
            }

            for (const [index, entry] of a.property.entries()) {
                if (!nodesAreEquivalent(entry, b.property[index])) {
                    return false;
                }
            }

            return nodesAreEquivalent(a.object, b.object);
        }
        case BINARY_EXPRESSION: {
            return (
                a.operator === b.operator &&
                nodesAreEquivalent(a.left, b.left) &&
                nodesAreEquivalent(a.right, b.right)
            );
        }
        default: {
            return false;
        }
    }
}
