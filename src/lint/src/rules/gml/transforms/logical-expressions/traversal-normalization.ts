import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

const { isObjectLike, isNode } = Core;

/**
 * Apply logical expression simplifications using AST traversal.
 * Handles De Morgan's laws, double negation, and boolean constant simplification.
 */
export function applyLogicalNormalization(ast: MutableGameMakerAstNode): MutableGameMakerAstNode {
    return applyLogicalNormalizationWithChangeMetadata(ast).ast;
}

/**
 * Apply logical-expression normalization and surface whether any node changed.
 */
export function applyLogicalNormalizationWithChangeMetadata(
    ast: MutableGameMakerAstNode
): Readonly<{ ast: MutableGameMakerAstNode; changed: boolean }> {
    if (!isObjectLike(ast)) {
        return Object.freeze({ ast, changed: false });
    }

    // Repeatedly apply passes until no changes occur, or max limit reached
    let changed = true;
    let changedAtLeastOnce = false;
    let iterations = 0;
    while (changed && iterations < 10) {
        changed = traverseAndSimplify(ast);
        if (changed) {
            changedAtLeastOnce = true;
        }
        iterations++;
    }

    return Object.freeze({ ast, changed: changedAtLeastOnce });
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
    if (isLogicalBinaryNode(node)) {
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

function isLogicalOperator(operator: unknown): boolean {
    return operator === "&&" || operator === "||";
}

function isLogicalBinaryNode(node: any): boolean {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type !== "LogicalExpression" && node.type !== "BinaryExpression") {
        return false;
    }

    return isLogicalOperator(node.operator);
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

                const shouldNegate = resolveBooleanReturnNegation(consBool, nextBool);
                if (shouldNegate !== null) {
                    body[i] = createBooleanReturnStatement(current.test, current.start, next.end, shouldNegate);
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

    if (!node.consequent) {
        return false;
    }

    // Normalize blocks to single statements if they contain only one statement
    const consequent = unwrapBlock(node.consequent);
    const alternate = node.alternate ? unwrapBlock(node.alternate) : null;

    if (alternate && consequent.type === "ReturnStatement" && alternate.type === "ReturnStatement") {
        const consArg = consequent.argument;
        const altArg = alternate.argument;

        const consBool = getBooleanValue(consArg);
        const altBool = getBooleanValue(altArg);

        const shouldNegate = resolveBooleanReturnNegation(consBool, altBool);
        if (shouldNegate !== null) {
            const newReturn = createBooleanReturnStatement(node.test, node.start, node.end, shouldNegate);
            replaceNode(node, newReturn);
            return true;
        }
    }

    // 3. if (cond) x = A; else x = B; -> x = cond ? A : B;
    if (alternate) {
        const consExp = getAssignmentExpressionFromStatementLikeNode(consequent);
        const altExp = getAssignmentExpressionFromStatementLikeNode(alternate);

        if (consExp && altExp && nodesRecursiveEqual(consExp.left, altExp.left)) {
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
    if (!node.alternate) {
        const assignment = getAssignmentExpressionFromStatementLikeNode(consequent);
        if (!assignment || assignment.operator !== "=") {
            return false;
        }

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

    return false;
}

function getAssignmentExpressionFromStatementLikeNode(node: any): any {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "AssignmentExpression") {
        return node;
    }

    if (node.type !== "ExpressionStatement") {
        return null;
    }

    if (!node.expression || typeof node.expression !== "object") {
        return null;
    }

    if (node.expression.type !== "AssignmentExpression") {
        return null;
    }

    return node.expression;
}

function resolveBooleanReturnNegation(firstValue: boolean | null, secondValue: boolean | null): boolean | null {
    if (firstValue === true && secondValue === false) {
        return false;
    }

    if (firstValue === false && secondValue === true) {
        return true;
    }

    return null;
}

function createBooleanReturnStatement(
    test: any,
    start: number | undefined,
    end: number | undefined,
    negate: boolean
): any {
    if (negate) {
        return {
            type: "ReturnStatement",
            argument: {
                type: "UnaryExpression",
                operator: "!",
                prefix: true,
                argument: test
            },
            start,
            end
        };
    }

    return {
        type: "ReturnStatement",
        argument: test,
        start,
        end
    };
}

function unwrapBlock(node: any): any {
    if (node.type === "BlockStatement" && node.body.length === 1) {
        return node.body[0];
    }
    return node;
}

function isUndefinedCheck(condition: any, target: any): boolean {
    while (condition && condition.type === "ParenthesizedExpression") {
        condition = condition.expression;
    }

    if (!condition || typeof condition !== "object") {
        return false;
    }

    const callee = condition?.callee ?? condition?.object;

    // is_undefined(target)
    if (
        condition.type === "CallExpression" &&
        callee &&
        callee.type === "Identifier" &&
        callee.name === "is_undefined" &&
        condition.arguments.length === 1
    ) {
        return nodesRecursiveEqual(condition.arguments[0], target);
    }

    // target == undefined
    if (condition.type === "BinaryExpression" && condition.operator === "==") {
        const leftUndefined =
            condition.left &&
            ((condition.left.type === "Identifier" && condition.left.name === "undefined") ||
                (condition.left.type === "Literal" &&
                    (condition.left.value === undefined || condition.left.value === "undefined")));
        const rightUndefined =
            condition.right &&
            ((condition.right.type === "Identifier" && condition.right.name === "undefined") ||
                (condition.right.type === "Literal" &&
                    (condition.right.value === undefined || condition.right.value === "undefined")));

        if (nodesRecursiveEqual(condition.left, target) && rightUndefined) {
            return true;
        }
        if (nodesRecursiveEqual(condition.right, target) && leftUndefined) {
            return true;
        }
    }
    return false;
}

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

    // Incomplete, but sufficient for variable/member matching
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
    if (isLogicalBinaryNode(argument) && argument.operator === "||") {
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
            type: argument.type,
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
    if (isLogicalBinaryNode(argument) && argument.operator === "&&") {
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
            type: argument.type,
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
        isLogicalBinaryNode(right) &&
        right.operator === "&&" &&
        nodesAreEqual(left, right.left)
    ) {
        // A || (A && B) -> A
        replaceNode(node, left);
        return true;
    }

    if (
        node.operator === "&&" &&
        isLogicalBinaryNode(right) &&
        right.operator === "||" &&
        nodesAreEqual(left, right.left)
    ) {
        // A && (A || B) -> A
        replaceNode(node, left);
        return true;
    }

    // Distributive / Shared Term: (A && B) || (A && C) -> A && (B || C)
    if (
        node.operator === "||" &&
        isLogicalBinaryNode(left) &&
        left.operator === "&&" &&
        isLogicalBinaryNode(right) &&
        right.operator === "&&"
    ) {
        // (A && B) || (A && C) -> A && (B || C)
        if (nodesAreEqual(left.left, right.left)) {
            const newRight = {
                type: node.type,
                operator: "||",
                left: left.right,
                right: right.right,
                start: right.start, // Approx
                end: right.end
            };
            const newRoot = {
                type: node.type,
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
        if (nodesAreEqual(left.right, right.right)) {
            const newLeft = {
                type: node.type,
                operator: "||",
                left: left.left,
                right: right.left,
                start: left.start,
                end: left.end
            };
            const newRoot = {
                type: node.type,
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
        if (nodesAreEqual(left.left, right.left) && areNegations(left.right, right.right)) {
            replaceNode(node, left.left);
            return true;
        }

        // (B && A) || (!B && A) -> A
        if (nodesAreEqual(left.right, right.right) && areNegations(left.left, right.left)) {
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

        if (A && B && notA && notB && nodesAreEqual(A, notA.argument) && nodesAreEqual(B, notB.argument)) {
            // Construct (A || B) && !(A && B)
            const orPart = {
                type: node.type,
                operator: "||",
                left: A,
                right: B
            };

            const andPart = {
                type: node.type,
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
                type: node.type,
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
    if (node1.type === "UnaryExpression" && node1.operator === "!" && nodesAreEqual(node1.argument, node2)) {
        return true;
    }
    // Check if node2 is !node1
    if (node2.type === "UnaryExpression" && node2.operator === "!" && nodesAreEqual(node2.argument, node1)) {
        return true;
    }
    return false;
}

function getBooleanValue(node: any): boolean | undefined {
    if (node.type !== "Literal") {
        return undefined;
    }

    if (typeof node.value === "boolean") {
        return node.value;
    }

    if (typeof node.value === "string") {
        if (node.value === "true") {
            return true;
        }

        if (node.value === "false") {
            return false;
        }
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
