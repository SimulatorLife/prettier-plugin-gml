/**
 * Lowering logic for GML enum declarations to JavaScript.
 *
 * GML enums are zero-indexed by default with optional explicit initializers.
 * This module provides the transformation that converts a GML enum into a
 * JavaScript IIFE pattern that creates an enum-like object.
 */

import type { EnumMemberNode } from "./ast.js";

/**
 * Generate JavaScript code that lowers a GML enum declaration.
 *
 * The generated code creates an immediately-invoked function expression (IIFE)
 * that builds an object with enum member properties. Members without explicit
 * initializers get auto-incremented values starting from 0.
 *
 * @param name - The enum name
 * @param members - The enum members with optional initializers
 * @param visitNode - Function to visit AST nodes (for initializer expressions)
 * @returns JavaScript code implementing the enum
 *
 * @example
 * ```typescript
 * // For: enum Colors { RED, GREEN, BLUE }
 * const code = lowerEnumDeclaration("Colors", [
 *   { name: "RED", initializer: null },
 *   { name: "GREEN", initializer: null },
 *   { name: "BLUE", initializer: null }
 * ], (node) => String(node));
 * // Generates:
 * // const Colors = (() => {
 * //     const __enum = {};
 * //     let __value = -1;
 * //     __value += 1;
 * //     __enum.RED = __value;
 * //     __value += 1;
 * //     __enum.GREEN = __value;
 * //     __value += 1;
 * //     __enum.BLUE = __value;
 * //     return __enum;
 * // })();
 * ```
 */
export function lowerEnumDeclaration(
    name: string,
    members: ReadonlyArray<EnumMemberNode>,
    visitNode: (node: unknown) => string,
    resolveEnumMemberName: (member: EnumMemberNode) => string
): string {
    const lines = [`const ${name} = (() => {`, "    const __enum = {};", "    let __value = -1;"];

    for (const member of members ?? []) {
        const memberName = resolveEnumMemberName(member);
        if (member.initializer !== undefined && member.initializer !== null) {
            const initializer =
                typeof member.initializer === "string" || typeof member.initializer === "number"
                    ? String(member.initializer)
                    : visitNode(member.initializer);
            lines.push(`    __value = ${initializer};`);
        } else {
            lines.push("    __value += 1;");
        }
        lines.push(`    __enum.${memberName} = __value;`);
    }

    lines.push("    return __enum;", "})();");
    return lines.join("\n");
}
