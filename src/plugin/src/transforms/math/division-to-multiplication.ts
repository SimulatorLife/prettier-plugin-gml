import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

const { BINARY_EXPRESSION, LITERAL } = Core;

/**
 * Converts division by a constant literal into multiplication by its reciprocal.
 * Example: `x / 2` -> `x * 0.5`
 *
 * @param node The AST node to check and potentially transform.
 * @returns True if the node was transformed, false otherwise.
 */
export function attemptConvertDivisionToMultiplication(
    node: MutableGameMakerAstNode
): boolean {
    if (node.type !== BINARY_EXPRESSION || node.operator !== "/") {
        return false;
    }

    const right = node.right;
    // Ensure we are dividing by a numeric literal
    if (right.type !== LITERAL || typeof right.value !== "number") {
        return false;
    }

    const divisor = right.value;
    if (divisor === 0) {
        return false; // Avoid division by zero issues
    }

    // Calculate reciprocal
    const reciprocal = 1 / divisor;

    // Mutate the node
    node.operator = "*";
    node.right = {
        ...right,
        value: reciprocal,
        // @ts-ignore - 'raw' is used by the printer but might not be in the strict type
        raw: String(reciprocal)
    } as any;

    return true;
}
