import {
    hasComment as sharedHasComment,
    normalizeHasCommentHelpers
} from "../comments/index.js";
import {
    asArray,
    isObjectLike,
    stripStringQuotes,
    unwrapParenthesizedExpression
} from "../shared/index.js";

const DEFAULT_HELPERS = Object.freeze({
    hasComment: sharedHasComment
});

const BINARY_EXPRESSION = "BinaryExpression";
const TEMPLATE_STRING_EXPRESSION = "TemplateStringExpression";
const TEMPLATE_STRING_TEXT = "TemplateStringText";
const LITERAL = "Literal";
const PARENTHESIZED_EXPRESSION = "ParenthesizedExpression";

/**
 * Convert chains of string concatenations into template string expressions.
 *
 * @param {unknown} ast
 * @param {{ hasComment?: (node: unknown) => boolean }} helpers
 */
export function convertStringConcatenations(ast, helpers = DEFAULT_HELPERS) {
    if (!isObjectLike(ast)) {
        return ast;
    }

    const normalizedHelpers = normalizeHasCommentHelpers(helpers);

    traverse(ast, null, null, normalizedHelpers);

    return ast;
}

function createTraversalState() {
    return {
        seen: new Set(),
        stack: []
    };
}

function traverse(node, parent, key, helpers, state = null) {
    if (!isObjectLike(node)) {
        return;
    }

    const traversalState = state ?? createTraversalState();
    const { seen, stack } = traversalState;

    if (seen.has(node)) {
        return;
    }

    seen.add(node);

    stack.push({ node, parent, key });

    if (Array.isArray(node)) {
        for (let index = 0; index < node.length; index += 1) {
            traverse(node[index], node, index, helpers, traversalState);
        }

        stack.pop();
        return;
    }

    for (const [childKey, value] of Object.entries(node)) {
        if (childKey === "parent") {
            continue;
        }

        if (isObjectLike(value)) {
            traverse(value, node, childKey, helpers, traversalState);
        }
    }

    if (node.type === BINARY_EXPRESSION) {
        attemptConvertConcatenation(node, parent, key, helpers, stack);
    }

    stack.pop();
}

function attemptConvertConcatenation(node, parent, key, helpers, stack) {
    if (!node || node.type !== BINARY_EXPRESSION || node.operator !== "+") {
        return;
    }

    if (hasConcatenationAncestor(stack)) {
        return;
    }

    const parts = [];
    if (!collectConcatenationParts(node, helpers, parts)) {
        return;
    }

    if (parts.length === 0) {
        return;
    }

    const atoms = buildTemplateAtoms(parts);
    if (!atoms || atoms.length === 0) {
        return;
    }

    node.type = TEMPLATE_STRING_EXPRESSION;
    delete node.operator;
    delete node.left;
    delete node.right;
    node.atoms = atoms;

    if (parent && key != undefined) {
        parent[key] = Array.isArray(parent) ? node : node;
    }
}

function collectConcatenationParts(node, helpers, output) {
    if (!isObjectLike(node)) {
        return false;
    }

    if (node.type === BINARY_EXPRESSION && node.operator === "+") {
        if (helpers.hasComment(node)) {
            return false;
        }

        if (!collectConcatenationParts(node.left, helpers, output)) {
            return false;
        }

        if (!collectConcatenationParts(node.right, helpers, output)) {
            return false;
        }

        return true;
    }

    if (node.type === PARENTHESIZED_EXPRESSION) {
        if (helpers.hasComment(node)) {
            return false;
        }

        const expression = node.expression;
        if (
            isObjectLike(expression) &&
            expression.type === BINARY_EXPRESSION &&
            expression.operator === "+"
        ) {
            return collectConcatenationParts(expression, helpers, output);
        }
    }

    if (Array.isArray(node)) {
        for (const child of node) {
            if (!collectConcatenationParts(child, helpers, output)) {
                return false;
            }
        }
        return true;
    }

    if (helpers.hasComment(node)) {
        return false;
    }

    output.push(node);
    return true;
}

/**
 * Convert the collected concatenation {@link parts} into template string
 * atoms. The builder keeps adjacent text atoms coalesced and aborts when it
 * encounters an unexpected node so the caller can fall back to the original
 * binary expression without mutating the AST.
 *
 * @param {Array<unknown>} parts Ordered nodes collected from the concatenation
 *        chain.
 * @returns {Array<object> | null} Template atoms ready to attach to the AST, or
 *          `null` when the inputs cannot be safely represented as a template
 *          string.
 */
function buildTemplateAtoms(parts) {
    const atoms = [];
    let pendingText = "";
    let containsStringLiteral = false;

    const flushPendingText = () => {
        if (!pendingText) {
            return;
        }

        const lastAtom = atoms.at(-1);
        if (lastAtom && lastAtom.type === TEMPLATE_STRING_TEXT) {
            lastAtom.value += pendingText;
        } else {
            atoms.push({ type: TEMPLATE_STRING_TEXT, value: pendingText });
        }

        pendingText = "";
    };

    for (const part of parts) {
        if (!part || typeof part !== "object") {
            return null;
        }

        const core = unwrapParenthesizedExpression(part);
        if (!core || typeof core !== "object") {
            return null;
        }

        if (isStringLiteral(core)) {
            const literalText = extractLiteralText(core);
            if (literalText == undefined) {
                return null;
            }

            pendingText += literalText;
            containsStringLiteral = true;
            continue;
        }

        if (core.type === TEMPLATE_STRING_EXPRESSION) {
            const nestedAtoms = asArray(core.atoms);
            if (nestedAtoms.length === 0) {
                return null;
            }

            for (const nestedAtom of nestedAtoms) {
                if (!nestedAtom || typeof nestedAtom !== "object") {
                    return null;
                }

                if (nestedAtom.type === TEMPLATE_STRING_TEXT) {
                    if (typeof nestedAtom.value !== "string") {
                        return null;
                    }

                    pendingText += nestedAtom.value;
                    containsStringLiteral = true;
                    continue;
                }

                flushPendingText();
                atoms.push(nestedAtom);
            }

            continue;
        }

        if (!isSafeInterpolatedExpression(core)) {
            return null;
        }

        flushPendingText();
        atoms.push(core);
    }

    flushPendingText();

    if (!containsStringLiteral) {
        return null;
    }

    return atoms;
}

function hasConcatenationAncestor(stack) {
    if (!Array.isArray(stack) || stack.length < 2) {
        return false;
    }

    for (let index = stack.length - 2; index >= 0; index -= 1) {
        const entry = stack[index];
        if (!entry || !entry.node || typeof entry.node !== "object") {
            continue;
        }

        const ancestorNode = entry.node;
        if (ancestorNode.type === BINARY_EXPRESSION) {
            return true;
        }
    }

    return false;
}

function isSafeInterpolatedExpression(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "Identifier":
        case "MemberDotExpression":
        case "MemberIndexExpression":
        case "CallExpression":
        case "NewExpression":
        case "ThisExpression":
        case "SuperExpression": {
            return true;
        }
        case PARENTHESIZED_EXPRESSION: {
            return isSafeInterpolatedExpression(
                unwrapParenthesizedExpression(node)
            );
        }
        default: {
            return false;
        }
    }
}

function isStringLiteral(node) {
    if (!node || node.type !== LITERAL) {
        return false;
    }

    if (typeof node.value !== "string") {
        return false;
    }

    const firstChar = node.value.at(0);
    const lastChar = node.value.at(-1);
    if (!firstChar || firstChar !== lastChar) {
        return false;
    }

    return firstChar === '"';
}

function extractLiteralText(node) {
    if (!isStringLiteral(node)) {
        return null;
    }

    const raw = node.value;
    if (raw.length < 2) {
        return "";
    }

    return stripStringQuotes(raw) ?? "";
}
