/**
 * Type guard and predicate functions for the GML printer.
 *
 * This module contains type guards and predicates that help classify AST nodes,
 * comments, and expressions during the printing process. These helpers were extracted
 * from print.ts to improve code organization and maintainability.
 *
 * @module printer/type-guards
 */

import { Core } from "@gml-modules/core";

import { safeGetParentNode } from "./path-utils.js";

// Re-export type constants for convenience
const STRING_TYPE = "string";
const NUMBER_TYPE = "number";
const OBJECT_TYPE = "object";
const UNDEFINED_TYPE = "undefined";

/**
 * Maximum depth to traverse when walking up the AST.
 *
 * This limit prevents infinite loops when traversing malformed or deeply nested ASTs.
 */
const MAX_ANCESTOR_TRAVERSAL_DEPTH = 100;

/**
 * Cached regex for detecting decorative banner-style comment lines.
 */
const DECORATIVE_SLASH_LINE_PATTERN = new RegExp(
    String.raw`^\s*\*?\/{${Core.DEFAULT_BANNER_COMMENT_POLICY_CONFIG.minLeadingSlashes},}\*?\s*$`
);

/**
 * Set of node types considered simple call arguments for formatting purposes.
 */
const SIMPLE_CALL_ARGUMENT_TYPES = new Set([
    "Identifier",
    "Literal",
    "MemberDotExpression",
    "MemberIndexExpression",
    "ThisExpression",
    "BooleanLiteral",
    "UndefinedLiteral"
]);

/**
 * Helper function to call a method on a path object safely.
 */
function callPathMethod(path: any, methodName: any, { args, defaultValue }: { args?: any[]; defaultValue?: any } = {}) {
    if (!path) {
        return defaultValue;
    }

    const method = path[methodName];
    if (typeof method !== "function") {
        return defaultValue;
    }

    const normalizedArgs = Core.toArray(args);

    return method.apply(path, normalizedArgs);
}

// ============================================================================
// Comment Type Guards
// ============================================================================

/**
 * Determines if a comment is a decorative banner-style block comment.
 *
 * A decorative comment consists entirely of lines matching the pattern of
 * slash-based decorative banners (e.g., "////////////////////").
 */
export function isDecorativeBlockComment(comment: any): boolean {
    if (!comment || (comment.type !== "BlockComment" && comment.type !== "CommentBlock")) {
        return false;
    }

    const value = comment.value;
    if (typeof value !== "string") {
        return false;
    }

    const lines = value.split(/\r?\n/);
    let hasDecorativeContent = false;
    for (const line_ of lines) {
        const normalizedLine = line_.replaceAll("\t", "    ");
        if (!Core.isNonEmptyTrimmedString(normalizedLine)) {
            continue;
        }

        if (!DECORATIVE_SLASH_LINE_PATTERN.test(normalizedLine)) {
            // Found a non-decorative line -> treat entire comment as normal content
            return false;
        }
        hasDecorativeContent = true;
    }

    return hasDecorativeContent;
}

/**
 * Determines if a comment is an inline empty block comment.
 *
 * An inline empty block comment is a block comment that:
 * - Does not have line breaks in its leading or trailing whitespace
 * - Consists of a single line
 * - Does not have line breaks in its content
 */
export function isInlineEmptyBlockComment(comment: any): boolean {
    if (!comment || comment.type !== "CommentBlock") {
        return false;
    }

    if (hasLineBreak(comment.leadingWS) || hasLineBreak(comment.trailingWS)) {
        return false;
    }

    if (typeof comment.lineCount === NUMBER_TYPE && comment.lineCount > 1) {
        return false;
    }

    if (typeof comment.value === STRING_TYPE && hasLineBreak(comment.value)) {
        return false;
    }

    return true;
}

// ============================================================================
// Call Expression Type Guards
// ============================================================================

/**
 * Determines if a call expression is "simple" for formatting purposes.
 *
 * A simple call expression:
 * - Has an identifier as the callee
 * - Has zero arguments, OR exactly one simple argument without comments
 */
export function isSimpleCallExpression(node: any): boolean {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.getCallExpressionIdentifier(node)) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);
    if (args.length === 0) {
        return true;
    }

    if (args.length > 1) {
        return false;
    }

    const [onlyArgument] = args;
    const argumentType = Core.getNodeType(onlyArgument);

    if (
        argumentType === "FunctionDeclaration" ||
        argumentType === "StructExpression" ||
        argumentType === "CallExpression"
    ) {
        return false;
    }

    if (Core.hasComment(onlyArgument)) {
        return false;
    }

    return true;
}

/**
 * Determines if an argument node is complex (requires special formatting).
 *
 * Complex arguments include functions, constructors, structs, and non-simple call expressions.
 */
export function isComplexArgumentNode(node: any): boolean {
    const nodeType = Core.getNodeType(node);
    if (!nodeType) {
        return false;
    }

    if (nodeType === "CallExpression") {
        return !isSimpleCallExpression(node);
    }

    return (
        nodeType === "FunctionDeclaration" ||
        nodeType === "FunctionExpression" ||
        nodeType === "ConstructorDeclaration" ||
        nodeType === "StructExpression"
    );
}

/**
 * Determines if a node is a simple call argument.
 *
 * Simple call arguments are identifiers, literals, member expressions, etc.
 * that don't require special indentation or breaking.
 */
export function isSimpleCallArgument(node: any): boolean {
    const nodeType = Core.getNodeType(node);
    if (!nodeType) {
        return false;
    }

    if (isComplexArgumentNode(node)) {
        return false;
    }

    if (SIMPLE_CALL_ARGUMENT_TYPES.has(nodeType)) {
        return true;
    }

    if (nodeType === "Literal" && typeof node.value === STRING_TYPE) {
        const literalValue = node.value.toLowerCase();
        if (literalValue === UNDEFINED_TYPE || literalValue === "noone") {
            return true;
        }
    }

    return false;
}

/**
 * Determines if an argument is a callback (function/constructor/struct).
 */
export function isCallbackArgument(argument: any): boolean {
    const argumentType = argument?.type;
    return (
        argumentType === "FunctionDeclaration" ||
        argumentType === "FunctionExpression" ||
        argumentType === "ConstructorDeclaration" ||
        argumentType === "StructExpression"
    );
}

/**
 * Determines if a call expression is a numeric call expression.
 *
 * Numeric call expressions are calls to numeric functions like sqr(), sqrt(), etc.
 */
export function isNumericCallExpression(node: any): boolean {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const calleeName = Core.getIdentifierText(node.object);
    if (typeof calleeName !== STRING_TYPE) {
        return false;
    }

    const normalized = calleeName.toLowerCase();
    return normalized === "sqr" || normalized === "sqrt";
}

/**
 * Determines if a node represents a numeric computation.
 */
export function isNumericComputationNode(node: any): boolean {
    if (!node || typeof node !== OBJECT_TYPE) {
        return false;
    }

    switch (node.type) {
        case "Literal": {
            return typeof node.value === NUMBER_TYPE || /^-?\d+(\.\d+)?$/.test(node.value);
        }
        case "UnaryExpression": {
            if (node.operator === "-" || node.operator === "+") {
                return isNumericComputationNode(node.argument);
            }

            return false;
        }
        case "BinaryExpression": {
            const isArithmetic =
                node.operator === "+" ||
                node.operator === "-" ||
                node.operator === "*" ||
                node.operator === "/" ||
                node.operator === "div" ||
                node.operator === "%" ||
                node.operator === "mod";

            if (!isArithmetic) {
                return false;
            }

            return isNumericComputationNode(node.left) && isNumericComputationNode(node.right);
        }
        case "ParenthesizedExpression": {
            return isNumericComputationNode(node.expression);
        }
        case "CallExpression": {
            if (expressionIsStringLike(node)) {
                return false;
            }

            return true;
        }
        default: {
            return false;
        }
    }
}

/**
 * Checks if a call expression has been sanitized (for macro safety).
 */
export function isCallExpressionSanitized(current: unknown, sanitizedMacroNames: Set<string>): boolean {
    if (!current || typeof current !== OBJECT_TYPE) {
        return false;
    }

    const node = current as any;
    if (node.type !== "CallExpression") {
        return false;
    }

    const calleeName = Core.getIdentifierText(node.object);
    if (typeof calleeName !== STRING_TYPE) {
        return false;
    }

    const normalized = calleeName.toLowerCase();
    return sanitizedMacroNames.has(normalized);
}

// ============================================================================
// Context-Aware Type Guards (require path)
// ============================================================================

/**
 * Determines if the current node is inside a constructor function.
 */
export function isInsideConstructorFunction(path: any): boolean {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let functionAncestorDepth: number | null = null;

    for (let depth = 0; ; depth += 1) {
        const ancestor = safeGetParentNode(path, depth);
        if (!ancestor) {
            break;
        }

        if (functionAncestorDepth === null && ancestor.type === "FunctionDeclaration") {
            const functionParent = path.getParentNode(depth + 1);
            if (!functionParent || functionParent.type !== "BlockStatement") {
                return false;
            }

            functionAncestorDepth = depth;
            continue;
        }

        if (ancestor.type === "ConstructorDeclaration") {
            return functionAncestorDepth !== null;
        }

        if (ancestor.type === "Program") {
            break;
        }
    }

    return false;
}

/**
 * Determines if a binary expression is part of a control flow logical test.
 */
export function isControlFlowLogicalTest(path: any): boolean {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let depth = 1;
    let currentNode = path.getValue();

    while (true) {
        const ancestor = safeGetParentNode(path, depth - 1);

        if (!ancestor) {
            return false;
        }

        if (ancestor.type === "ParenthesizedExpression" || ancestor.type === "BinaryExpression") {
            currentNode = ancestor;
            depth += 1;
            continue;
        }

        if (ancestor.type === "IfStatement" && ancestor.test === currentNode) {
            return true;
        }

        if (ancestor.type === "WhileStatement" && ancestor.test === currentNode) {
            return true;
        }

        if (ancestor.type === "DoUntilStatement" && ancestor.test === currentNode) {
            return true;
        }

        if (ancestor.type === "RepeatStatement" && ancestor.test === currentNode) {
            return true;
        }

        if (ancestor.type === "WithStatement" && ancestor.test === currentNode) {
            return true;
        }

        if (ancestor.type === "ForStatement" && ancestor.test === currentNode) {
            return true;
        }

        return false;
    }
}

/**
 * Determines if a comparison is within a logical chain of comparisons.
 */
export function isComparisonWithinLogicalChain(path: any): boolean {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let depth = 1;
    let currentNode = path.getValue();

    while (depth < MAX_ANCESTOR_TRAVERSAL_DEPTH) {
        const ancestor = safeGetParentNode(path, depth - 1);

        if (!ancestor) {
            return false;
        }

        // Skip over parenthesized expressions to find meaningful parent
        if (ancestor.type === "ParenthesizedExpression") {
            currentNode = ancestor;
            depth += 1;
            continue;
        }

        // Continue through comparison operators in the chain
        if (ancestor.type === "BinaryExpression" && Core.isComparisonBinaryOperator(ancestor.operator)) {
            currentNode = ancestor;
            depth += 1;
            continue;
        }

        // Check if we've reached a logical operator at the top of the chain
        if (ancestor.type === "BinaryExpression" && Core.isLogicalBinaryOperator(ancestor.operator)) {
            return ancestor.left === currentNode || ancestor.right === currentNode;
        }

        return false;
    }

    return false;
}

/**
 * Checks if synthetic parenthesis flattening is enabled in the current context.
 */
export function isSyntheticParenFlatteningEnabled(path: any): boolean {
    return checkSyntheticParenFlattening(path);
}

/**
 * Checks if synthetic parenthesis flattening is explicitly forced in the current context.
 */
export function isSyntheticParenFlatteningForced(path: any): boolean {
    return checkSyntheticParenFlattening(path, true);
}

/**
 * Determines if the current node is within a numeric call argument context.
 */
export function isWithinNumericCallArgument(path: any): boolean {
    let depth = 1;
    let currentNode = callPathMethod(path, "getValue", { defaultValue: null });

    while (true) {
        const ancestor = callPathMethod(path, "getParentNode", {
            args: depth === 1 ? [] : [depth - 1],
            defaultValue: null
        });

        if (!ancestor) {
            return false;
        }

        if (ancestor.type === "ParenthesizedExpression" || ancestor.type === "BinaryExpression") {
            currentNode = ancestor;
            depth += 1;
            continue;
        }

        if (ancestor.type === "CallExpression") {
            if (!Array.isArray(ancestor.arguments)) {
                return false;
            }

            const matchingArgument = ancestor.arguments.find(
                (argument: any) => argument === currentNode || argument?.expression === currentNode
            );

            if (!matchingArgument) {
                return false;
            }

            return isNumericCallExpression(ancestor);
        }

        return false;
    }
}

/**
 * Determines if the current node is in an l-value chain (left-hand side of assignment).
 */
export function isInLValueChain(path: any): boolean {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    const node = path.getValue();
    const parent = safeGetParentNode(path);

    if (!parent || typeof parent.type !== STRING_TYPE) {
        return false;
    }

    if (parent.type === "CallExpression" && Array.isArray(parent.arguments) && parent.arguments.includes(node)) {
        return false;
    }

    if (parent.type === "CallExpression" && parent.object === node) {
        const grandparent = path.getParentNode(1);

        if (!grandparent || typeof grandparent.type !== STRING_TYPE) {
            return false;
        }

        return isLValueExpression(grandparent.type);
    }

    return isLValueExpression(parent.type);
}

// ============================================================================
// Simple Predicates
// ============================================================================

/**
 * Determines if a node type represents an l-value expression.
 */
export function isLValueExpression(nodeType: string): boolean {
    return nodeType === "MemberIndexExpression" || nodeType === "CallExpression" || nodeType === "MemberDotExpression";
}

/**
 * Checks if a name is a valid JavaScript/GML identifier.
 */
export function isValidIdentifierName(name: any): boolean {
    return typeof name === STRING_TYPE && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/**
 * Checks if an assignment matches the expected parameter at a given index.
 */
export function isArgumentAssignment(assign: any, paramName: string, argIndex: number): boolean {
    if (!assign || assign.type !== "AssignmentExpression") {
        return false;
    }

    if (assign.operator !== "=") {
        return false;
    }

    const left = assign.left;
    if (!left || left.type !== "MemberIndexExpression") {
        return false;
    }

    const objectNode = left.object;
    if (!objectNode || objectNode.type !== "Identifier") {
        return false;
    }

    const objectName = objectNode.name;
    if (typeof objectName !== STRING_TYPE) {
        return false;
    }

    if (objectName.toLowerCase() !== "argument") {
        return false;
    }

    const indexNode = left.index;
    if (!indexNode) {
        return false;
    }

    if (indexNode.type === "Identifier") {
        const indexName = indexNode.name;
        if (typeof indexName === STRING_TYPE && indexName === paramName) {
            return true;
        }
    }

    if (indexNode.type === "Literal") {
        const indexValue = indexNode.value;
        if (typeof indexValue === NUMBER_TYPE && indexValue === argIndex) {
            return true;
        }
    }

    return false;
}

/**
 * Determines if an expression is a self-multiplication (e.g., x * x).
 */
export function isSelfMultiplicationExpression(expression: any): boolean {
    if (!expression || expression.type !== "BinaryExpression") {
        return false;
    }

    if (expression.operator !== "*") {
        return false;
    }

    const left = expression.left;
    const right = expression.right;

    if (!left || !right) {
        return false;
    }

    if (left.type !== "Identifier" || right.type !== "Identifier") {
        return false;
    }

    const leftName = left.name;
    const rightName = right.name;

    if (typeof leftName !== STRING_TYPE || typeof rightName !== STRING_TYPE) {
        return false;
    }

    return leftName === rightName;
}

// ============================================================================
// Logical Expression Type Guards
// ============================================================================

/**
 * Determines if a node is a logical comparison clause pattern.
 */
export function isLogicalComparisonClause(node: any): boolean {
    const clauseExpression = unwrapLogicalClause(node);
    if (clauseExpression?.type !== "BinaryExpression") {
        return false;
    }

    if (!isLogicalOrOperator(clauseExpression.operator)) {
        return false;
    }

    return isComparisonAndConjunction(clauseExpression.left) && isComparisonAndConjunction(clauseExpression.right);
}

/**
 * Determines if a node is a comparison-and-conjunction pattern.
 */
export function isComparisonAndConjunction(node: any): boolean {
    const expression = unwrapLogicalClause(node);
    if (expression?.type !== "BinaryExpression") {
        return false;
    }

    if (!isLogicalAndOperator(expression.operator)) {
        return false;
    }

    if (!isComparisonExpression(expression.left)) {
        return false;
    }

    return isSimpleLogicalOperand(expression.right);
}

/**
 * Determines if a node is a comparison expression.
 */
export function isComparisonExpression(node: any): boolean {
    const expression = unwrapLogicalClause(node);
    return expression?.type === "BinaryExpression" && Core.isComparisonBinaryOperator(expression.operator);
}

/**
 * Determines if a node is a simple logical operand.
 */
export function isSimpleLogicalOperand(node: any): boolean {
    const expression = unwrapLogicalClause(node);
    if (!expression) {
        return false;
    }

    if (expression.type === "Identifier") {
        return true;
    }

    if (expression.type === "Literal") {
        return true;
    }

    if (expression.type === "UnaryExpression") {
        return isSimpleLogicalOperand(expression.argument);
    }

    return isComparisonExpression(expression);
}

/**
 * Checks if an operator is a logical OR operator.
 */
export function isLogicalOrOperator(operator: string): boolean {
    return operator === "or" || operator === "||";
}

/**
 * Checks if an operator is a logical AND operator.
 */
export function isLogicalAndOperator(operator: string): boolean {
    return operator === "and" || operator === "&&";
}

// ============================================================================
// Helper Functions (Internal)
// ============================================================================

/**
 * Checks if synthetic parenthesis flattening is configured in the AST.
 *
 * @internal
 */
function checkSyntheticParenFlattening(path: any, requireExplicit = false): boolean {
    let depth = 1;
    while (true) {
        const ancestor = callPathMethod(path, "getParentNode", {
            args: depth === 1 ? [] : [depth - 1],
            defaultValue: null
        });

        if (!ancestor) {
            return false;
        }

        if (ancestor.type === "FunctionDeclaration" || ancestor.type === "ConstructorDeclaration") {
            if (ancestor._flattenSyntheticNumericParens === true) {
                return true;
            }
        } else if (ancestor.type === "Program") {
            return requireExplicit
                ? ancestor._flattenSyntheticNumericParens === true
                : ancestor._flattenSyntheticNumericParens !== false;
        }

        depth += 1;
    }
}

/**
 * Unwraps a logical clause by removing surrounding parenthesized expressions.
 *
 * @internal
 */
function unwrapLogicalClause(node: any): any {
    let current = node;
    while (current?.type === "ParenthesizedExpression") {
        current = current.expression;
    }
    return current ?? null;
}

/**
 * Determines if an expression produces a string-like value.
 */
export function expressionIsStringLike(node: any): boolean {
    if (!node || typeof node !== OBJECT_TYPE) {
        return false;
    }

    if (node.type === "Literal") {
        if (typeof node.value === STRING_TYPE && /^".*"$/.test(node.value)) {
            return true;
        }

        return false;
    }

    if (node.type === "ParenthesizedExpression") {
        return expressionIsStringLike(node.expression);
    }

    if (node.type === "BinaryExpression" && node.operator === "+") {
        return expressionIsStringLike(node.left) || expressionIsStringLike(node.right);
    }

    if (node.type === "CallExpression") {
        const calleeName = Core.getIdentifierText(node.object);
        if (typeof calleeName === STRING_TYPE) {
            const normalized = calleeName.toLowerCase();
            if (normalized === STRING_TYPE || normalized.startsWith("string_")) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Checks if text contains any line break characters.
 */
export function hasLineBreak(text: any): boolean {
    return typeof text === STRING_TYPE && /[\r\n\u2028\u2029]/.test(text);
}
