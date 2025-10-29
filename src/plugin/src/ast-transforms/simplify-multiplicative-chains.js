import { hasComment } from "../comments/index.js";
import {
    assignClonedLocation,
    cloneAstNode,
    getNodeEndIndex,
    getNodeStartIndex
} from "../shared/index.js";

const BINARY_EXPRESSION = "BinaryExpression";
const LITERAL = "Literal";
const PARENTHESIZED_EXPRESSION = "ParenthesizedExpression";
const UNARY_EXPRESSION = "UnaryExpression";

export function simplifyNumericMultiplicativeChains(ast, context = null) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    traverse(ast, new Set(), context);

    return ast;
}

function traverse(node, seen, context) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (seen.has(node)) {
        return;
    }

    seen.add(node);

    if (Array.isArray(node)) {
        for (const element of node) {
            traverse(element, seen, context);
        }
        return;
    }

    if (node.type === BINARY_EXPRESSION) {
        attemptSimplifyMultiplicativeChain(node, context);
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            traverse(value, seen, context);
        }
    }
}

function attemptSimplifyMultiplicativeChain(node, context) {
    const operands = [];
    const operators = [];

    if (!collectMultiplicativeOperands(node, operands, operators, context)) {
        return false;
    }

    if (operands.length < 2) {
        return false;
    }

    let constantProduct = 1;
    let hasConstantOperand = false;
    const nonNumericOperands = [];

    for (const [index, operand] of operands.entries()) {
        const operator = index === 0 ? "*" : operators[index - 1];

        const numericValue = extractNumericValue(operand);
        if (numericValue !== null) {
            hasConstantOperand = true;
            if (operator === "*") {
                constantProduct *= numericValue;
            } else if (operator === "/") {
                constantProduct /= numericValue;
            } else {
                return false;
            }
            continue;
        }

        if (operator === "/") {
            return false;
        }

        nonNumericOperands.push(operand);
        if (nonNumericOperands.length > 1) {
            return false;
        }
    }

    if (!hasConstantOperand || nonNumericOperands.length !== 1) {
        return false;
    }

    if (!Number.isFinite(constantProduct)) {
        return false;
    }

    const nonNumeric = cloneAstNode(nonNumericOperands[0]);
    if (!nonNumeric) {
        return false;
    }

    if (approximatelyEqual(constantProduct, 1)) {
        replaceNode(node, nonNumeric);
        return true;
    }

    const literalValue = normalizeNumericLiteral(constantProduct);
    if (literalValue === null) {
        return false;
    }

    const literalNode = createLiteralNode(literalValue, node);
    if (!literalNode) {
        return false;
    }

    const replacement = {
        type: BINARY_EXPRESSION,
        operator: "*",
        left: nonNumeric,
        right: literalNode
    };

    assignClonedLocation(replacement, node);
    replaceNode(node, replacement);
    return true;
}

function collectMultiplicativeOperands(node, operands, operators, context) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return false;
    }

    if (
        expression.type === BINARY_EXPRESSION &&
        isMultiplicativeOperator(expression.operator)
    ) {
        if (hasComment(expression)) {
            return false;
        }

        if (
            hasInlineCommentBetween(expression.left, expression.right, context)
        ) {
            return false;
        }

        if (
            !collectMultiplicativeOperands(
                expression.left,
                operands,
                operators,
                context
            )
        ) {
            return false;
        }

        operators.push(expression.operator);

        if (
            !collectMultiplicativeOperands(
                expression.right,
                operands,
                operators,
                context
            )
        ) {
            return false;
        }

        return true;
    }

    if (hasComment(expression)) {
        return false;
    }

    operands.push(expression);
    return true;
}

function hasInlineCommentBetween(left, right, context) {
    if (!context || typeof context !== "object") {
        return false;
    }

    const sourceText = context.originalText ?? context.sourceText;
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return false;
    }

    if (
        !left ||
        !right ||
        typeof left !== "object" ||
        typeof right !== "object"
    ) {
        return false;
    }

    const leftEnd = getNodeEndIndex(left);
    const rightStart = getNodeStartIndex(right);

    if (
        leftEnd == undefined ||
        rightStart == undefined ||
        rightStart <= leftEnd ||
        rightStart > sourceText.length
    ) {
        return false;
    }

    const between = sourceText.slice(leftEnd, rightStart);
    if (between.length === 0) {
        return false;
    }

    return (
        between.includes("/*") ||
        between.includes("//") ||
        between.includes("#")
    );
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

function isMultiplicativeOperator(operator) {
    if (typeof operator !== "string") {
        return false;
    }

    const normalized = operator.toLowerCase();
    return normalized === "*" || normalized === "/";
}

function extractNumericValue(node) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return null;
    }

    if (expression.type === LITERAL) {
        const rawValue = expression.value;
        if (typeof rawValue === "number") {
            return Number.isFinite(rawValue) ? rawValue : null;
        }
        if (typeof rawValue === "string") {
            const numeric = Number(rawValue);
            return Number.isFinite(numeric) ? numeric : null;
        }
        return null;
    }

    if (
        expression.type === UNARY_EXPRESSION &&
        (expression.operator === "+" || expression.operator === "-")
    ) {
        const innerValue = extractNumericValue(expression.argument);
        if (innerValue === null) {
            return null;
        }

        return expression.operator === "-" ? -innerValue : innerValue;
    }

    return null;
}

function approximatelyEqual(value, expected) {
    const tolerance = Math.max(1, Math.abs(expected)) * Number.EPSILON * 8;
    return Math.abs(value - expected) <= tolerance;
}

function normalizeNumericLiteral(value) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const fixed = value.toFixed(15);
    let trimmed = fixed.replace(/0+$/, "");

    if (trimmed.endsWith(".")) {
        trimmed = trimmed.slice(0, -1);
    }

    if (trimmed === "") {
        return "0";
    }

    if (trimmed === "-0") {
        return "0";
    }

    return trimmed;
}

function createLiteralNode(value, template) {
    const literal = {
        type: LITERAL,
        value
    };

    assignClonedLocation(literal, template);
    return literal;
}

function replaceNode(target, replacement) {
    if (!replacement || typeof replacement !== "object") {
        return;
    }

    for (const key of Object.keys(target)) {
        delete target[key];
    }

    Object.assign(target, replacement);
}
