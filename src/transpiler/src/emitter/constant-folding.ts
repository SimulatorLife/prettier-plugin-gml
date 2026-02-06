import type { BinaryExpressionNode } from "./ast.js";

/**
 * Attempt to fold a constant binary expression at compile time.
 *
 * This optimization reduces output size and improves runtime performance
 * by evaluating simple arithmetic and logical operations on literal values
 * during transpilation instead of at runtime.
 *
 * Examples:
 *   2 + 3 → 5
 *   10 / 2 → 5
 *   true && false → false
 *   "hello" + " world" → "hello world"
 *
 * This is especially beneficial for hot-reload scenarios where the same
 * constant expressions might be evaluated repeatedly during development.
 *
 * @param ast - Binary expression node to potentially fold
 * @returns The folded constant value if both operands are literals and the
 *          operation can be safely evaluated, otherwise null
 */
export function tryFoldConstantExpression(ast: BinaryExpressionNode): number | string | boolean | null {
    // Only fold if both operands are literals
    if (ast.left.type !== "Literal" || ast.right.type !== "Literal") {
        return null;
    }

    const left = ast.left.value;
    const right = ast.right.value;

    // Handle null/undefined operands conservatively
    if (left === null || left === undefined || right === null || right === undefined) {
        return null;
    }

    const op = ast.operator;

    // Arithmetic operations (numbers only)
    if (typeof left === "number" && typeof right === "number") {
        switch (op) {
            case "+": {
                return left + right;
            }
            case "-": {
                return left - right;
            }
            case "*": {
                return left * right;
            }
            case "/": {
                // Avoid division by zero
                return right === 0 ? null : left / right;
            }
            case "div": {
                // GML's div performs integer division (floor division)
                return right === 0 ? null : Math.floor(left / right);
            }
            case "%":
            case "mod": {
                // Avoid modulo by zero
                return right === 0 ? null : left % right;
            }
            case "**": {
                return left ** right;
            }
            case "<": {
                return left < right;
            }
            case "<=": {
                return left <= right;
            }
            case ">": {
                return left > right;
            }
            case ">=": {
                return left >= right;
            }
            case "==":
            case "===": {
                return left === right;
            }
            case "!=":
            case "!==": {
                return left !== right;
            }
            case "&": {
                return left & right;
            }
            case "|": {
                return left | right;
            }
            case "^":
            case "xor": {
                return left ^ right;
            }
            case "<<": {
                return left << right;
            }
            case ">>": {
                return left >> right;
            }
        }
    }

    // String concatenation
    if (typeof left === "string" && typeof right === "string" && op === "+") {
        return left + right;
    }

    // Logical operations (boolean only)
    if (typeof left === "boolean" && typeof right === "boolean") {
        switch (op) {
            case "&&":
            case "and": {
                return left && right;
            }
            case "||":
            case "or": {
                return left || right;
            }
            case "==":
            case "===": {
                return left === right;
            }
            case "!=":
            case "!==": {
                return left !== right;
            }
        }
    }

    // Couldn't fold this expression
    return null;
}
