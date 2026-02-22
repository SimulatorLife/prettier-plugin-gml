import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

const { isObjectLike, isNode } = Core;

/**
 * Apply logical expression simplifications using AST traversal.
 * Handles De Morgan's laws, double negation, and boolean constant simplification.
 */
export function applyLogicalNormalization(ast: MutableGameMakerAstNode): MutableGameMakerAstNode {
    if (!isObjectLike(ast)) {
        return ast;
    }

    // Repeatedly apply passes until no changes occur, or max limit reached
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 10) {
        changed = traverseAndSimplify(ast);
        iterations++;
    }

    return ast;
}

function traverseAndSimplify(node: any): boolean {
    if (!isObjectLike(node)) {
        return false;
    }

    let changed = false;

    // Post-order traversal: simplify children first
    const keys = Object.keys(node);
    for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
            for (const element of child) {
                if (traverseAndSimplify(element)) {
                    changed = true;
                }
            }
        } else if (isNode(child) && traverseAndSimplify(child)) {
                changed = true;
            }
    }

    // Now try to simplify the current node
    if (simplifyNode(node)) {
        changed = true;
    }

    return changed;
}

function simplifyNode(node: any): boolean {
    if (node.type === "UnaryExpression" && node.operator === "!") {
        return simplifyNot(node);
    }
    if (node.type === "LogicalExpression") {
        return simplifyLogical(node);
    }
    return false;
}

function simplifyNot(node: any): boolean {
    const argument = node.argument;

    // Double negation: !!A -> A (only if A is boolean-safe or we are in a boolean context?
    // For now, let's limit to !(!A) -> A.
    // In GML, (!(!exp)) is equivalent to bool(exp). If exp is strictly boolean, it is A.
    // But safely, !(!A) where argument is a UnaryExpression(!)
    if (argument.type === "UnaryExpression" && argument.operator === "!") {
        // Replace current node with argument.argument
        // We can't replace the node reference, so we have to copy properties.
        const inner = argument.argument;
        replaceNode(node, inner);
        return true;
    }

    // De Morgan's: !(A || B) -> !A && !B
    if (argument.type === "LogicalExpression" && argument.operator === "||") {
        // Create (!A) && (!B)
        const left = argument.left;
        const right = argument.right;

        // Check if parens are needed, but constructing AST nodes is explicit.
        // We will replace 'node' with a new BinaryExpression (or LogicalExpression)

        const newLeft = {
            type: "UnaryExpression",
            operator: "!",
            prefix: true,
            argument: left,
            start: left.start, // Approximated
            end: left.end
        };

        const newRight = {
            type: "UnaryExpression",
            operator: "!",
            prefix: true,
            argument: right,
            start: right.start,
            end: right.end
        };

        const newLogical = {
            type: "LogicalExpression",
            operator: "&&",
            left: newLeft,
            right: newRight,
            start: node.start,
            end: node.end,
            parent: node.parent
        };

        replaceNode(node, newLogical);
        return true;
    }

    // De Morgan's: !(A && B) -> !A || !B
    if (argument.type === "LogicalExpression" && argument.operator === "&&") {
        const left = argument.left;
        const right = argument.right;

        const newLeft = {
            type: "UnaryExpression",
            operator: "!",
            prefix: true,
            argument: left,
            start: left.start,
            end: left.end
        };

        const newRight = {
            type: "UnaryExpression",
            operator: "!",
            prefix: true,
            argument: right,
            start: right.start,
            end: right.end
        };

        const newLogical = {
            type: "LogicalExpression",
            operator: "||",
            left: newLeft,
            right: newRight,
            start: node.start,
            end: node.end,
            parent: node.parent
        };

        replaceNode(node, newLogical);
        return true;
    }

    // Parentheses handling: !( (A) ) -> !A
    if (argument.type === "ParenthesizedExpression") {
        node.argument = argument.expression;
        // Don't mark as changed yet, wait for next pass to catch !A
        // Actually, changing the child is a change.
        return true;
    }

    return false;
}

function simplifyLogical(node: any): boolean {
    // Simplify: true && A -> A
    // Simplify: false || A -> A

    // We assume short-circuiting behavior.

    // Check for boolean literals
    const leftBool = getBooleanValue(node.left);
    const rightBool = getBooleanValue(node.right);

    if (node.operator === "&&") {
        // true && A -> A
        if (leftBool === true) {
            replaceNode(node, node.right);
            return true;
        }
        // A && true -> A
        if (rightBool === true) {
            replaceNode(node, node.left);
            return true;
        }
        // false && A -> false (short circuit)
        if (leftBool === false) {
            replaceNode(node, node.left); // Replace with the 'false' literal
            return true;
        }
        // A && false -> false (if A has no side effects?)
        // Safer to not remove A if it might be a function call.
        // For now, let's stick to the ones that preserve side effects or known constants.
    }

    if (node.operator === "||") {
        // false || A -> A
        if (leftBool === false) {
            replaceNode(node, node.right);
            return true;
        }
        // A || false -> A
        if (rightBool === false) {
            replaceNode(node, node.left);
            return true;
        }
        // true || A -> true
        if (leftBool === true) {
            replaceNode(node, node.left);
            return true;
        }
    }

    // Absorption: A || (A && B) -> A
    // Absorption: A && (A || B) -> A

    // Check if right is parenthesized, unwrap for inspection
    let right = node.right;
    while (right.type === "ParenthesizedExpression") right = right.expression;

    if (node.operator === "||" && right.type === "LogicalExpression" && right.operator === "&&" && nodesAreEqual(node.left, right.left)) {
                // A || (A && B) -> A
                replaceNode(node, node.left);
                return true;
            }

    if (node.operator === "&&" && right.type === "LogicalExpression" && right.operator === "||" && nodesAreEqual(node.left, right.left)) {
                // A && (A || B) -> A
                replaceNode(node, node.left);
                return true;
            }

    return false;
}

function getBooleanValue(node: any): boolean | undefined {
    if (node.type === "Literal" && typeof node.value === "boolean") {
        return node.value;
    }
    return undefined;
}

function nodesAreEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.type !== b.type) return false;

    if (a.type === "Identifier") {
        return a.name === b.name;
    }
    if (a.type === "Literal") {
        return a.value === b.value;
    }
    // Deep comparison for simple structural equality, avoiding cyclic issues
    // Just handling simple Identifiers and Literals for now for Absorption laws.
    return false;
}

/**
 * Replace properties of 'target' with properties of 'source'.
 * This mutates 'target' in place, effectively replacing it in the AST.
 */
function replaceNode(target: any, source: any) {
    // Clear existing keys
    for (const key in target) {
        if (Object.hasOwn(target, key)) {
            delete target[key];
        }
    }
    // Copy new keys
    for (const key in source) {
        if (Object.hasOwn(source, key)) {
            target[key] = source[key];
        }
    }
}
