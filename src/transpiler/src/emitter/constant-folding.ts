import type { BinaryExpressionNode, UnaryExpressionNode } from "./ast.js";

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

/**
 * Attempt to fold a constant unary expression at compile time.
 *
 * This optimization complements binary expression folding by handling
 * unary operations on literal values during transpilation.
 *
 * Examples:
 *   -5 → -5
 *   +3.14 → 3.14
 *   !true → false
 *   ~15 → -16
 *   not false → true
 *
 * @param ast - Unary expression node to potentially fold
 * @returns The folded constant value if the operand is a literal and the
 *          operation can be safely evaluated, otherwise null
 */
export function tryFoldConstantUnaryExpression(ast: UnaryExpressionNode): number | boolean | null {
    // Only fold if the operand is a literal
    if (ast.argument.type !== "Literal") {
        return null;
    }

    const operand = ast.argument.value;

    // Handle null/undefined operands conservatively
    if (operand === null || operand === undefined) {
        return null;
    }

    const op = ast.operator;

    // Numeric unary operations
    // Note: The parser represents numeric literals as strings, so we need to parse them
    // But don't try to convert boolean strings or actual booleans
    const isBoolValue = typeof operand === "boolean" || operand === "true" || operand === "false";
    if (!isBoolValue) {
        const numValue = typeof operand === "number" ? operand : Number(operand);
        if (!Number.isNaN(numValue)) {
            switch (op) {
                case "-": {
                    return -numValue;
                }
                case "+": {
                    return numValue;
                }
                case "~": {
                    return ~numValue;
                }
            }
        }
    }

    // Boolean/logical unary operations
    // Note: The parser represents boolean literals as strings ("true"/"false")
    // so we need to handle both actual booleans and string representations
    const isBool = typeof operand === "boolean" || operand === "true" || operand === "false";
    if (isBool) {
        const boolValue = operand === true || operand === "true";
        switch (op) {
            case "!":
            case "not": {
                return !boolValue;
            }
        }
    }

    // Couldn't fold this expression
    return null;
}
