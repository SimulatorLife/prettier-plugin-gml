/**
 * GML → JavaScript operator mapping for transpiler code generation.
 *
 * This module centralizes all operator transformations that the transpiler applies
 * when converting GML binary and unary expressions to JavaScript. GameMaker Language
 * uses some non-standard operator names (e.g., `div`, `mod`, `and`, `or`) that must
 * be mapped to their JavaScript equivalents.
 *
 * ## Design Principles
 *
 * - **Explicit over implicit**: Every GML operator is listed, even when it maps 1:1 to JavaScript
 * - **Strict equality by default**: GML's `==` and `!=` map to JavaScript's `===` and `!==` to avoid type coercion
 * - **Immutable mappings**: The operator tables are frozen to prevent accidental modification
 *
 * ## Binary Operators
 *
 * | GML Operator | JavaScript Equivalent | Notes                                    |
 * |--------------|-----------------------|------------------------------------------|
 * | `div`        | `/`                  | Integer division in GML; regular / in JS |
 * | `mod`        | `%`                  | Modulo operator                          |
 * | `and`        | `&&`                 | Logical AND                              |
 * | `or`         | `||`                 | Logical OR                               |
 * | `xor`        | `^`                  | Bitwise XOR (GML has no logical XOR)     |
 * | `==`         | `===`                | Strict equality (no type coercion)       |
 * | `!=`         | `!==`                | Strict inequality (no type coercion)     |
 *
 * ## Unary Operators
 *
 * | GML Operator | JavaScript Equivalent | Notes                      |
 * |--------------|-----------------------|----------------------------|
 * | `not`        | `!`                  | Logical NOT (non-standard) |
 * | `~`          | `~`                  | Bitwise NOT                |
 * | `-`          | `-`                  | Unary negation             |
 * | `+`          | `+`                  | Unary plus                 |
 *
 * @module operator-mapping
 */

/**
 * Maps GML binary operators to their JavaScript equivalents.
 *
 * This mapping handles both GML-specific operators (like `div`, `mod`, `and`, `or`)
 * and standard operators that need special handling (like `==` → `===` for strict equality).
 *
 * Operators not listed in this table are passed through unchanged, which handles
 * standard JavaScript operators that GameMaker also supports (+, -, *, /, <, >, etc.).
 *
 * @internal
 */
const BINARY_OPERATOR_MAP: Readonly<Record<string, string>> = Object.freeze({
    // GML-specific operator names
    div: "/",
    mod: "%",
    and: "&&",
    or: "||",
    xor: "^",

    // Equality operators (map to strict variants)
    "==": "===",
    "!=": "!=="
});

/**
 * Maps GML unary operators to their JavaScript equivalents.
 *
 * This mapping primarily handles the non-standard `not` keyword that some GML
 * code uses instead of the standard `!` operator.
 *
 * @internal
 */
const UNARY_OPERATOR_MAP: Readonly<Record<string, string>> = Object.freeze({
    not: "!"
});

/**
 * Converts a GML binary operator to its JavaScript equivalent.
 *
 * This function transforms GML-specific operator names (like `div`, `mod`, `and`, `or`)
 * to their JavaScript equivalents. It also ensures strict equality by mapping `==` to `===`.
 *
 * **Examples:**
 * ```typescript
 * mapBinaryOperator("div")  // → "/"
 * mapBinaryOperator("mod")  // → "%"
 * mapBinaryOperator("and")  // → "&&"
 * mapBinaryOperator("==")   // → "==="
 * mapBinaryOperator("+")    // → "+" (pass-through)
 * ```
 *
 * @param op - The GML binary operator to map
 * @returns The equivalent JavaScript operator, or the original operator if no mapping exists
 */
export function mapBinaryOperator(op: string): string {
    return BINARY_OPERATOR_MAP[op] ?? op;
}

/**
 * Converts a GML unary operator to its JavaScript equivalent.
 *
 * This function handles GML-specific unary operator names, primarily the non-standard
 * `not` keyword that maps to JavaScript's `!` operator.
 *
 * **Examples:**
 * ```typescript
 * mapUnaryOperator("not")  // → "!"
 * mapUnaryOperator("~")    // → "~"
 * mapUnaryOperator("-")    // → "-"
 * mapUnaryOperator("+")    // → "+"
 * ```
 *
 * @param op - The GML unary operator to map
 * @returns The equivalent JavaScript operator, or the original operator if no mapping exists
 */
export function mapUnaryOperator(op: string): string {
    return UNARY_OPERATOR_MAP[op] ?? op;
}
