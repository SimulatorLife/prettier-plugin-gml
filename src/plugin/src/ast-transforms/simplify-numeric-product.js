import { assignClonedLocation, cloneAstNode } from "../shared/index.js";

const BINARY_EXPRESSION = "BinaryExpression";
const LITERAL = "Literal";
const PARENTHESIZED_EXPRESSION = "ParenthesizedExpression";

export function simplifyNumericProductExpressions(ast) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    traverse(ast, new Set());
    return ast;
}

function traverse(node, seen) {
    if (!node || typeof node !== "object" || seen.has(node)) {
        return;
    }

    seen.add(node);

    if (Array.isArray(node)) {
        for (const entry of node) {
            traverse(entry, seen);
        }
        return;
    }

    if (node.type === BINARY_EXPRESSION) {
        trySimplifySingleSymbolProduct(node);
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            traverse(value, seen);
        }
    }
}

function trySimplifySingleSymbolProduct(node) {
    const factors = [];
    if (!collectMultiplicativeFactors(node, factors, false)) {
        return false;
    }

    let symbol = null;
    const numericFactors = [];

    for (const { expression, inverse } of factors) {
        const literalValue = parseNumericLiteral(expression);

        if (literalValue != null) {
            numericFactors.push({ value: literalValue, inverse });
            continue;
        }

        if (inverse) {
            return false;
        }

        if (symbol) {
            return false;
        }

        symbol = expression;
    }

    if (!symbol || numericFactors.length === 0) {
        return false;
    }

    let product = 1;
    for (const { value, inverse } of numericFactors) {
        if (inverse) {
            product /= value;
        } else {
            product *= value;
        }
    }

    if (!Number.isFinite(product)) {
        return false;
    }

    const literalText = normalizeNumericValue(product);
    if (literalText === null) {
        return false;
    }

    const literalNode = createNumericLiteral(literalText, node);
    const symbolClone = cloneAstNode(symbol) ?? symbol;

    node.operator = "*";
    node.left = symbolClone;
    node.right = literalNode;

    return true;
}

function collectMultiplicativeFactors(node, output, inverse) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return false;
    }

    if (expression.type === BINARY_EXPRESSION) {
        const operator = normalizeOperator(expression.operator);

        if (operator === "*") {
            return (
                collectMultiplicativeFactors(
                    expression.left,
                    output,
                    inverse
                ) &&
                collectMultiplicativeFactors(expression.right, output, inverse)
            );
        }

        if (operator === "/") {
            return (
                collectMultiplicativeFactors(
                    expression.left,
                    output,
                    inverse
                ) &&
                collectMultiplicativeFactors(expression.right, output, !inverse)
            );
        }
    }

    output.push({ expression, inverse });
    return true;
}

function normalizeOperator(operator) {
    if (typeof operator !== "string") {
        return null;
    }

    return operator.toLowerCase();
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

function parseNumericLiteral(node) {
    const expression = unwrapExpression(node);
    if (!expression || expression.type !== LITERAL) {
        return null;
    }

    const raw = expression.value;

    if (typeof raw === "number") {
        return Number.isFinite(raw) ? raw : null;
    }

    if (typeof raw === "string") {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function normalizeNumericValue(value) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const rounded = Number(value.toPrecision(15));
    const normalized = Object.is(rounded, -0) ? 0 : rounded;

    let text = normalized.toString();

    if (!text.includes("e") && text.includes(".")) {
        while (text.endsWith("0")) {
            text = text.slice(0, -1);
        }

        if (text.endsWith(".")) {
            text += "0";
        }
    }

    return text;
}

function createNumericLiteral(value, template) {
    const literal = {
        type: LITERAL,
        value
    };

    assignClonedLocation(literal, template);
    return literal;
}
