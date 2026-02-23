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
        if (key === "parent") continue;

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

    if (node.type === "IfStatement") {
        return simplifyIfStatement(node);
    }
    if (node.type === "Program" || node.type === "BlockStatement") {
        return simplifyStatementList(node.body);
    }
    return false;
}

function simplifyStatementList(body: any[]): boolean {
    if (!Array.isArray(body)) return false;
    let changed = false;
    for (let i = 0; i < body.length - 1; i++) {
        const current = body[i];
        const next = body[i + 1];

        if (current && next && current.type === "IfStatement" && !current.alternate) {
            // if (cond) { return true; } return false;
            const consequent = unwrapBlock(current.consequent);

            if (consequent.type === "ReturnStatement" && next.type === "ReturnStatement") {
                const consBool = getBooleanValue(consequent.argument);
                const nextBool = getBooleanValue(next.argument);

                if (consBool === true && nextBool === false) {
                    // return cond;
                    // Replace 'current' with newReturn, remove 'next'.
                    const newReturn = {
                        type: "ReturnStatement",
                        argument: current.test,
                        start: current.start,
                        end: next.end
                    };
                    body[i] = newReturn;
                    body.splice(i + 1, 1);
                    changed = true;
                    // Decrement / handle index shift if we continue loop?
                    // We just continue, next iteration checks new current vs next next.
                } else if (consBool === false && nextBool === true) {
                    // return !cond;
                    const newNot = {
                        type: "UnaryExpression",
                        operator: "!",
                        prefix: true,
                        argument: current.test
                    };
                    const newReturn = {
                        type: "ReturnStatement",
                        argument: newNot,
                        start: current.start,
                        end: next.end
                    };
                    body[i] = newReturn;
                    body.splice(i + 1, 1);
                    changed = true;
                }
            }
        }
    }
    return changed;
}

function simplifyIfStatement(node: any): boolean {
    // 1. if (cond) return true; else return false; -> return cond;
    // 2. if (cond) return false; else return true; -> return !cond;

    // Check structure: has consequent and alternate
    if (!node.consequent || !node.alternate) return false;

    // Normalize blocks to single statements if they contain only one statement
    const consequent = unwrapBlock(node.consequent);
    const alternate = unwrapBlock(node.alternate);

    if (consequent.type === "ReturnStatement" && alternate.type === "ReturnStatement") {
        const consArg = consequent.argument;
        const altArg = alternate.argument;

        const consBool = getBooleanValue(consArg);
        const altBool = getBooleanValue(altArg);

        if (consBool === true && altBool === false) {
            // return cond;
            const newReturn = {
                type: "ReturnStatement",
                argument: node.test,
                start: node.start,
                end: node.end
            };
            replaceNode(node, newReturn);
            return true;
        }

        if (consBool === false && altBool === true) {
            // return !cond;
            const newNot = {
                type: "UnaryExpression",
                operator: "!",
                prefix: true,
                argument: node.test
            };
            const newReturn = {
                type: "ReturnStatement",
                argument: newNot,
                start: node.start,
                end: node.end
            };
            replaceNode(node, newReturn);
            return true;
        }
    }

    // 3. if (cond) x = A; else x = B; -> x = cond ? A : B;
    if (consequent.type === "ExpressionStatement" && alternate.type === "ExpressionStatement") {
        const consExp = consequent.expression;
        const altExp = alternate.expression;

        if (
            consExp.type === "AssignmentExpression" &&
            altExp.type === "AssignmentExpression" && // Check if targets valid (same identifier/member expression)
            nodesRecursiveEqual(consExp.left, altExp.left)
        ) {
            // x = cond ? A : B;
            const conditional = {
                type: "ConditionalExpression",
                test: node.test,
                consequent: consExp.right,
                alternate: altExp.right
            };
            const assignment = {
                type: "AssignmentExpression",
                operator: consExp.operator, // Assume same operator (=)
                left: consExp.left,
                right: conditional
            };
            const statement = {
                type: "ExpressionStatement",
                expression: assignment,
                start: node.start,
                end: node.end
            };
            replaceNode(node, statement);
            return true;
        }
    }

    // 4. if (is_undefined(x)) x = y; -> x ??= y;
    // 5. if (x == undefined) x = y; -> x ??= y;
    if (
        !node.alternate && // if (cond) stmt;
        consequent.type === "ExpressionStatement"
    ) {
        const assignment = consequent.expression;
        if (assignment.type === "AssignmentExpression" && assignment.operator === "=") {
            const target = assignment.left;
            const value = assignment.right;

            // Check condition: is_undefined(x) or x == undefined
            if (isUndefinedCheck(node.test, target)) {
                // x ??= value;
                const coalesceAssign = {
                    type: "AssignmentExpression",
                    operator: "??=",
                    left: target,
                    right: value
                };
                const statement = {
                    type: "ExpressionStatement",
                    expression: coalesceAssign,
                    start: node.start,
                    end: node.end
                };
                replaceNode(node, statement);
                return true;
            }
        }
    }

    return false;
}

function unwrapBlock(node: any): any {
    if (node.type === "BlockStatement" && node.body.length === 1) {
        return node.body[0];
    }
    return node;
}

function isUndefinedCheck(condition: any, target: any): boolean {
    // is_undefined(target)
    if (
        condition.type === "CallExpression" &&
        condition.callee.type === "Identifier" &&
        condition.callee.name === "is_undefined" &&
        condition.arguments.length === 1
    ) {
        return nodesRecursiveEqual(condition.arguments[0], target);
    }

    // target == undefined
    if (condition.type === "BinaryExpression" && condition.operator === "==") {
        if (
            nodesRecursiveEqual(condition.left, target) &&
            condition.right.type === "Identifier" &&
            condition.right.name === "undefined"
        ) {
            return true;
        }
        if (
            nodesRecursiveEqual(condition.right, target) &&
            condition.left.type === "Identifier" &&
            condition.left.name === "undefined"
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Structural equality check for GML AST nodes.
 *
 * Handles Identifier, Literal, MemberDotExpression, and MemberIndexExpression
 * by recursing into their sub-nodes. All other node types compare as unequal.
 * This is intentionally incomplete but sufficient for the boolean absorption
 * and distributive law patterns that operate on variable expressions and
 * member-access chains.
 */
function nodesRecursiveEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.type !== b.type) return false;

    if (a.type === "Identifier") return a.name === b.name;
    if (a.type === "Literal") return a.value === b.value;

    if (a.type === "MemberDotExpression") {
        return nodesRecursiveEqual(a.object, b.object) && nodesRecursiveEqual(a.property, b.property);
    }
    if (a.type === "MemberIndexExpression") {
        return nodesRecursiveEqual(a.object, b.object) && nodesRecursiveEqual(a.index, b.index);
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
    let left = node.left;
    while (left.type === "ParenthesizedExpression") left = left.expression;

    if (
        node.operator === "||" &&
        right.type === "LogicalExpression" &&
        right.operator === "&&" &&
        nodesRecursiveEqual(left, right.left)
    ) {
        // A || (A && B) -> A
        replaceNode(node, left);
        return true;
    }

    if (
        node.operator === "&&" &&
        right.type === "LogicalExpression" &&
        right.operator === "||" &&
        nodesRecursiveEqual(left, right.left)
    ) {
        // A && (A || B) -> A
        replaceNode(node, left);
        return true;
    }

    // Distributive / Shared Term: (A && B) || (A && C) -> A && (B || C)
    if (
        node.operator === "||" &&
        left.type === "LogicalExpression" &&
        left.operator === "&&" &&
        right.type === "LogicalExpression" &&
        right.operator === "&&"
    ) {
        // (A && B) || (A && C) -> A && (B || C)
        if (nodesRecursiveEqual(left.left, right.left)) {
            const newRight = {
                type: "LogicalExpression",
                operator: "||",
                left: left.right,
                right: right.right,
                start: right.start, // Approx
                end: right.end
            };
            const newRoot = {
                type: "LogicalExpression",
                operator: "&&",
                left: left.left,
                right: newRight,
                start: node.start,
                end: node.end
            };
            replaceNode(node, newRoot);
            return true;
        }

        // (B && A) || (C && A) -> (B || C) && A
        if (nodesRecursiveEqual(left.right, right.right)) {
            const newLeft = {
                type: "LogicalExpression",
                operator: "||",
                left: left.left,
                right: right.left,
                start: left.start,
                end: left.end
            };
            const newRoot = {
                type: "LogicalExpression",
                operator: "&&",
                left: newLeft,
                right: left.right,
                start: node.start,
                end: node.end
            };
            replaceNode(node, newRoot);
            return true;
        }

        // (A && B) || (A && !B) -> A (Complement/Redundancy)
        if (nodesRecursiveEqual(left.left, right.left) && areNegations(left.right, right.right)) {
            replaceNode(node, left.left);
            return true;
        }

        // (B && A) || (!B && A) -> A
        if (nodesRecursiveEqual(left.right, right.right) && areNegations(left.left, right.left)) {
            replaceNode(node, left.right);
            return true;
        }

        // XOR Pattern: (A && !B) || (!A && B) -> (A || B) && !(A && B)
        // Checks that match (A && !B) || (!A && B)
        const term1 = node.left;
        const term2 = node.right;

        let A, B, notA, notB;

        // Extract from Left: (A && !B) or (!A && B)
        if (term1.left.type === "UnaryExpression" && term1.left.operator === "!") {
            notA = term1.left;
            B = term1.right;
            // Expect Right to be (A && !B)
            if (term2.right.type === "UnaryExpression" && term2.right.operator === "!") {
                notB = term2.right;
                A = term2.left;
            }
        } else if (term1.right.type === "UnaryExpression" && term1.right.operator === "!") {
            notB = term1.right;
            A = term1.left;
            // Expect Right to be (!A && B)
            if (term2.left.type === "UnaryExpression" && term2.left.operator === "!") {
                notA = term2.left;
                B = term2.right;
            }
        }

        if (A && B && notA && notB && nodesRecursiveEqual(A, notA.argument) && nodesRecursiveEqual(B, notB.argument)) {
            // Construct (A || B) && !(A && B)
            const orPart = {
                type: "BinaryExpression", // LogicalExpression in some usages, but GML printer handles both
                operator: "||",
                left: A,
                right: B
            };
            // Make sure to use proper types for your printer.
            // Assuming LogicalExpression for ||, &&
            (orPart as any).type = "LogicalExpression";

            const andPart = {
                type: "LogicalExpression",
                operator: "&&",
                left: A,
                right: B
            };

            const notAndPart = {
                type: "UnaryExpression",
                operator: "!",
                prefix: true,
                argument: andPart
            };

            const finalExpr = {
                type: "LogicalExpression",
                operator: "&&",
                left: orPart,
                right: notAndPart,
                start: node.start,
                end: node.end
            };

            replaceNode(node, finalExpr);
            return true;
        }
    }

    return false;
}

function areNegations(node1: any, node2: any): boolean {
    if (!node1 || !node2) return false;
    // Check if node1 is !node2
    if (node1.type === "UnaryExpression" && node1.operator === "!" && nodesRecursiveEqual(node1.argument, node2)) {
        return true;
    }
    // Check if node2 is !node1
    if (node2.type === "UnaryExpression" && node2.operator === "!" && nodesRecursiveEqual(node2.argument, node1)) {
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
