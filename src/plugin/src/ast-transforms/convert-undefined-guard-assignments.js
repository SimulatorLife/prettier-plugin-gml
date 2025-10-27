import {
    assignClonedLocation,
    cloneAstNode,
    forEachNodeChild,
    getIdentifierText as sharedGetIdentifierText,
    hasComment as sharedHasComment,
    isObjectLike,
    isUndefinedLiteral as sharedIsUndefinedLiteral,
    toMutableArray,
    unwrapParenthesizedExpression
} from "../shared/index.js";

const DEFAULT_HELPERS = Object.freeze({
    hasComment: sharedHasComment,
    getIdentifierText: sharedGetIdentifierText,
    isUndefinedLiteral: sharedIsUndefinedLiteral,
    cloneAstNode
});

/**
 * Convert simple undefined guard assignments into ternary expressions so they
 * collapse to a single statement during printing. Matches `if` statements that
 * assign the same identifier in both branches when the guard checks the
 * identifier against the `undefined` sentinel (either via the `is_undefined`
 * helper or an equality comparison).
 *
 * @param {unknown} ast
 * @param {{
 *   hasComment?: (node: unknown) => boolean,
 *   getIdentifierText?: (node: unknown) => string | null,
 *   isUndefinedLiteral?: (node: unknown) => boolean,
 *   cloneAstNode?: (node: unknown) => unknown
 * }} helpers
 * @returns {unknown}
 */
export function convertUndefinedGuardAssignments(
    ast,
    helpers = DEFAULT_HELPERS
) {
    if (!isObjectLike(ast)) {
        return ast;
    }

    const normalizedHelpers = {
        hasComment:
            typeof helpers.hasComment === "function"
                ? helpers.hasComment
                : DEFAULT_HELPERS.hasComment,
        getIdentifierText:
            typeof helpers.getIdentifierText === "function"
                ? helpers.getIdentifierText
                : DEFAULT_HELPERS.getIdentifierText,
        isUndefinedLiteral:
            typeof helpers.isUndefinedLiteral === "function"
                ? helpers.isUndefinedLiteral
                : DEFAULT_HELPERS.isUndefinedLiteral,
        cloneAstNode:
            typeof helpers.cloneAstNode === "function"
                ? helpers.cloneAstNode
                : DEFAULT_HELPERS.cloneAstNode
    };

    visit(ast, null, null);

    return ast;

    function visit(node, parent, property) {
        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (!isObjectLike(node)) {
            return;
        }

        if (
            node.type === "ParenthesizedExpression" &&
            unwrapSyntheticParentheses(node, parent, property)
        ) {
            const replacement = parent?.[property];
            visit(replacement, parent, property);
            return;
        }

        if (node.type === "IfStatement") {
            const converted = convertIfStatement(
                node,
                parent,
                property,
                normalizedHelpers
            );
            if (converted) {
                return;
            }
        }

        forEachNodeChild(node, (child, key) => {
            visit(child, node, key);
        });
    }
}

function convertIfStatement(node, parent, property, helpers) {
    if (!node || !parent) {
        return false;
    }

    if (helpers.hasComment(node)) {
        return false;
    }

    if (!node.consequent) {
        return false;
    }

    const consequentAssignment = extractSoleAssignment(
        node.consequent,
        helpers
    );

    if (!consequentAssignment) {
        return false;
    }

    const targetName = helpers.getIdentifierText(consequentAssignment.left);
    if (!targetName) {
        return false;
    }

    const guardTest = resolveUndefinedGuardExpression(
        node.test,
        targetName,
        helpers
    );
    if (!guardTest) {
        return false;
    }

    const alternateAssignment = extractSoleAssignment(node.alternate, helpers);

    if (alternateAssignment) {
        if (
            targetName !== helpers.getIdentifierText(alternateAssignment.left)
        ) {
            return false;
        }

        return replaceWithAssignmentStatement(
            parent,
            property,
            {
                type: "AssignmentExpression",
                operator: "=",
                left: consequentAssignment.left,
                right: {
                    type: "TernaryExpression",
                    test: guardTest,
                    consequent: consequentAssignment.right,
                    alternate: alternateAssignment.right
                }
            },
            node
        );
    }

    return replaceWithAssignmentStatement(
        parent,
        property,
        {
            type: "AssignmentExpression",
            operator: "??=",
            left: consequentAssignment.left,
            right: consequentAssignment.right
        },
        node
    );
}

function extractSoleAssignment(branchNode, helpers) {
    if (!branchNode || branchNode.type !== "BlockStatement") {
        return null;
    }

    if (helpers.hasComment(branchNode)) {
        return null;
    }

    const statements = toMutableArray(branchNode.body);
    if (statements.length !== 1) {
        return null;
    }

    const [statement] = statements;
    if (!statement || helpers.hasComment(statement)) {
        return null;
    }

    if (statement.type === "AssignmentExpression") {
        return statement.operator === "=" ? statement : null;
    }

    if (
        statement.type === "ExpressionStatement" &&
        statement.expression &&
        !helpers.hasComment(statement.expression) &&
        statement.expression.type === "AssignmentExpression"
    ) {
        return statement.expression.operator === "="
            ? statement.expression
            : null;
    }

    return null;
}

function resolveUndefinedGuardExpression(testNode, targetName, helpers) {
    if (!testNode) {
        return null;
    }

    if (helpers.hasComment(testNode)) {
        return null;
    }

    const unwrapped = unwrapParenthesizedExpression(testNode) ?? testNode;

    if (helpers.hasComment(unwrapped)) {
        return null;
    }

    if (isIsUndefinedCall(unwrapped, targetName, helpers)) {
        return unwrapped;
    }

    if (unwrapped.type !== "BinaryExpression") {
        return null;
    }

    if (unwrapped.operator !== "==") {
        return null;
    }

    const { left, right } = unwrapped;
    const leftName = helpers.getIdentifierText(left);
    const rightName = helpers.getIdentifierText(right);

    if (leftName === targetName && helpers.isUndefinedLiteral(right)) {
        return createIsUndefinedCall(left, helpers);
    }

    if (rightName === targetName && helpers.isUndefinedLiteral(left)) {
        return createIsUndefinedCall(right, helpers);
    }

    return null;
}

function isIsUndefinedCall(node, targetName, helpers) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (helpers.hasComment(node)) {
        return false;
    }

    const callee = node.object;
    if (
        !callee ||
        callee.type !== "Identifier" ||
        callee.name !== "is_undefined"
    ) {
        return false;
    }

    const args = toMutableArray(node.arguments);
    if (args.length !== 1) {
        return false;
    }

    return helpers.getIdentifierText(args[0]) === targetName;
}

function createIsUndefinedCall(identifierNode, helpers) {
    return {
        type: "CallExpression",
        object: { type: "Identifier", name: "is_undefined" },
        arguments: [helpers.cloneAstNode(identifierNode)]
    };
}

function replaceWithAssignmentStatement(
    parent,
    property,
    assignment,
    sourceNode
) {
    const replacementStatement = {
        type: "ExpressionStatement",
        expression: assignment
    };

    if (assignment.right?.type === "TernaryExpression") {
        assignClonedLocation(assignment.right, sourceNode.test);
    }

    assignClonedLocation(assignment, sourceNode);
    assignClonedLocation(replacementStatement, sourceNode);

    if (Array.isArray(parent)) {
        parent[property] = replacementStatement;
        return true;
    }

    if (typeof property === "string") {
        parent[property] = replacementStatement;
        return true;
    }

    return false;
}

function unwrapSyntheticParentheses(node, parent, property) {
    if (!node || node.type !== "ParenthesizedExpression") {
        return false;
    }

    if (node.synthetic !== true) {
        return false;
    }

    if (!parent) {
        return false;
    }

    if (!property && property !== 0) {
        return false;
    }

    const expression = node.expression;
    if (!expression || typeof expression !== "object") {
        return false;
    }

    if (
        parent.type === "BinaryExpression" &&
        typeof property === "string" &&
        (property === "left" || property === "right") &&
        (parent.operator === "<" ||
            parent.operator === "<=" ||
            parent.operator === ">" ||
            parent.operator === ">=") &&
        expression.type === "BinaryExpression" &&
        (expression.operator === "+" || expression.operator === "-")
    ) {
        parent[property] = expression;
        return true;
    }

    return false;
}
