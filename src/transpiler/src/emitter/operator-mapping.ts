/**
 * Operator mapping utilities for GML → JavaScript transpilation.
 *
 * This module centralizes all operator transformations, making them easier to
 * maintain, test, and extend. GML has several operators that don't exist in
 * JavaScript (e.g., `div`, `mod`, `and`, `or`) and must be mapped to their
 * JavaScript equivalents.
 */

/**
 * Maps GML binary operators to their JavaScript equivalents.
 *
 * Transformations include:
 * - GML-specific operators (`div` → `/`, `mod` → `%`, `and` → `&&`, `or` → `||`)
 * - Strict equality conversion (`==` → `===`, `!=` → `!==`)
 * - Bitwise operators (preserved but documented for clarity)
 *
 * @param operatorToken - The GML operator to map
 * @returns The equivalent JavaScript operator
 *
 * @example
 * ```typescript
 * mapBinaryOperator("div") // → "/"
 * mapBinaryOperator("and") // → "&&"
 * mapBinaryOperator("==")  // → "==="
 * mapBinaryOperator("+")   // → "+" (passthrough for standard operators)
 * ```
 */
export function mapBinaryOperator(operatorToken: string): string {
    return BINARY_OPERATOR_MAPPINGS[operatorToken] ?? operatorToken;
}

/**
 * Maps GML unary operators to their JavaScript equivalents.
 *
 * Most unary operators are the same in both languages, but GML's `not`
 * operator must be converted to JavaScript's `!`.
 *
 * @param operatorToken - The GML unary operator to map
 * @returns The equivalent JavaScript operator
 *
 * @example
 * ```typescript
 * mapUnaryOperator("not") // → "!"
 * mapUnaryOperator("-")   // → "-" (passthrough)
 * mapUnaryOperator("~")   // → "~" (passthrough)
 * ```
 */
export function mapUnaryOperator(operatorToken: string): string {
    return operatorToken === "not" ? "!" : operatorToken;
}

const BINARY_OPERATOR_MAPPINGS: Readonly<Record<string, string>> = Object.freeze({
    div: "/",
    mod: "%",
    and: "&&",
    or: "||",
    xor: "^",
    "==": "===",
    "!=": "!=="
});
