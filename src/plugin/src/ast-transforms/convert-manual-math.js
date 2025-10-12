import { hasComment as sharedHasComment } from "../comments/index.js";
import { cloneLocation } from "../../../shared/ast-locations.js";

const DEFAULT_HELPERS = Object.freeze({
    hasComment: sharedHasComment
});

const BINARY_EXPRESSION = "BinaryExpression";
const IDENTIFIER = "Identifier";
const MEMBER_DOT_EXPRESSION = "MemberDotExpression";
const MEMBER_INDEX_EXPRESSION = "MemberIndexExpression";
const PARENTHESIZED_EXPRESSION = "ParenthesizedExpression";

/**
 * Convert bespoke math expressions into their builtin GML equivalents.
 *
 * Currently supports collapsing {@code operand * operand} expressions into
 * {@code sqr(operand)}.
 *
 * @param {unknown} ast - Parsed AST to rewrite in place.
 * @param {{ hasComment?: (node: unknown) => boolean }} helpers - Optional
 *     helper overrides for comment detection.
 */
export function convertManualMathExpressions(ast, helpers = DEFAULT_HELPERS) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const normalizedHelpers = {
        hasComment:
            typeof helpers.hasComment === "function"
                ? helpers.hasComment
                : DEFAULT_HELPERS.hasComment
    };

    traverse(ast, null, null, normalizedHelpers, new Set());

    return ast;
}

function traverse(node, parent, key, helpers, seen) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (seen.has(node)) {
        return;
    }

    seen.add(node);

    if (Array.isArray(node)) {
        for (let index = 0; index < node.length; index += 1) {
            traverse(node[index], node, index, helpers, seen);
        }
        return;
    }

    for (const [childKey, value] of Object.entries(node)) {
        if (childKey === "parent") {
            continue;
        }

        if (value && typeof value === "object") {
            traverse(value, node, childKey, helpers, seen);
        }
    }

    if (node.type === BINARY_EXPRESSION) {
        attemptConvertSquare(node, helpers);
    }
}

function attemptConvertSquare(node, helpers) {
    if (!node || node.type !== BINARY_EXPRESSION || node.operator !== "*") {
        return;
    }

    if (helpers.hasComment(node)) {
        return;
    }

    const rawLeft = node.left;
    const rawRight = node.right;

    if (!rawLeft || !rawRight) {
        return;
    }

    if (helpers.hasComment(rawLeft) || helpers.hasComment(rawRight)) {
        return;
    }

    const left = unwrapParenthesizedExpression(rawLeft);
    const right = unwrapParenthesizedExpression(rawRight);

    if (!left || !right) {
        return;
    }

    if (helpers.hasComment(left) || helpers.hasComment(right)) {
        return;
    }

    if (!areEquivalentSquareOperands(left, right)) {
        return;
    }

    if (!isSafeSquareOperand(left)) {
        return;
    }

    transformIntoSqrCall(node, left);
}

function unwrapParenthesizedExpression(node) {
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

function areEquivalentSquareOperands(a, b) {
    if (!a || !b) {
        return false;
    }

    if (a === b) {
        return true;
    }

    if (a.type !== b.type) {
        return false;
    }

    switch (a.type) {
        case IDENTIFIER:
            return a.name === b.name;
        case MEMBER_DOT_EXPRESSION:
            return (
                areEquivalentSquareOperands(a.object, b.object) &&
                areEquivalentSquareOperands(a.property, b.property)
            );
        case MEMBER_INDEX_EXPRESSION:
            return (
                areEquivalentSquareOperands(a.object, b.object) &&
                compareMemberIndexProperties(a.property, b.property)
            );
        default:
            return false;
    }
}

function compareMemberIndexProperties(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
        return false;
    }

    if (a.length !== b.length || a.length !== 1) {
        return false;
    }

    const [left] = a;
    const [right] = b;

    if (left === right) {
        return true;
    }

    if (!left || !right) {
        return false;
    }

    if (left.type !== right.type) {
        return false;
    }

    switch (left.type) {
        case IDENTIFIER:
            return left.name === right.name;
        case MEMBER_DOT_EXPRESSION:
            return areEquivalentSquareOperands(left, right);
        case MEMBER_INDEX_EXPRESSION:
            return areEquivalentSquareOperands(left, right);
        default:
            return (
                Object.hasOwn(left, "value") &&
                Object.hasOwn(right, "value") &&
                left.value === right.value
            );
    }
}

function isSafeSquareOperand(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case IDENTIFIER:
            return typeof node.name === "string" && node.name.length > 0;
        case MEMBER_DOT_EXPRESSION:
            return (
                isSafeSquareOperand(node.object) &&
                node.property &&
                node.property.type === IDENTIFIER &&
                typeof node.property.name === "string"
            );
        case MEMBER_INDEX_EXPRESSION:
            return (
                isSafeSquareOperand(node.object) &&
                Array.isArray(node.property) &&
                node.property.length === 1 &&
                isIndexOperandSafe(node.property[0])
            );
        default:
            return false;
    }
}

function isIndexOperandSafe(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === IDENTIFIER) {
        return typeof node.name === "string" && node.name.length > 0;
    }

    if (
        node.type === MEMBER_DOT_EXPRESSION ||
        node.type === MEMBER_INDEX_EXPRESSION
    ) {
        return isSafeSquareOperand(node);
    }

    if (Object.hasOwn(node, "value")) {
        return true;
    }

    return false;
}

function buildSqrCall(template, operand) {
    if (!template || !operand) {
        return null;
    }

    const call = {
        type: "CallExpression",
        object: createIdentifier("sqr", template),
        arguments: [operand]
    };

    if (Object.hasOwn(template, "start")) {
        call.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        call.end = cloneLocation(template.end);
    }

    return call;
}

function transformIntoSqrCall(target, operand) {
    if (!target || !operand) {
        return;
    }

    const callExpression = buildSqrCall(target, operand);
    if (!callExpression) {
        return;
    }

    delete target.operator;
    delete target.left;
    delete target.right;

    for (const key of Object.keys(target)) {
        if (!(key in callExpression)) {
            delete target[key];
        }
    }

    for (const [key, value] of Object.entries(callExpression)) {
        target[key] = value;
    }
}

function createIdentifier(name, template) {
    if (typeof name !== "string" || name.length === 0) {
        return null;
    }

    const identifier = { type: IDENTIFIER, name };

    if (template && typeof template === "object") {
        if (Object.hasOwn(template, "start")) {
            identifier.start = cloneLocation(template.start);
        }

        if (Object.hasOwn(template, "end")) {
            identifier.end = cloneLocation(template.end);
        }
    }

    return identifier;
}
