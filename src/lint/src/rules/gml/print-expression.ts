import { Core } from "@gml-modules/core";

/**
 * Read the source text that corresponds to an AST node using its start/end
 * position metadata.
 *
 * @param sourceText - The full GML source string.
 * @param node - The AST node whose source span should be extracted.
 * @returns The substring of `sourceText` covered by the node, or `null` when
 *   the node is absent or its position metadata is missing.
 */
export function readNodeText(sourceText: string, node: any): string | null {
    if (!node || typeof node !== "object") {
        return null;
    }
    const start = Core.getNodeStartIndex(node);
    const end = Core.getNodeEndIndex(node);
    if (typeof start === "number" && typeof end === "number") {
        return sourceText.slice(start, end);
    }
    return null;
}

/**
 * Reconstruct a minimal GML source representation of an expression node.
 *
 * Used by lint auto-fix transforms that need to render a mutated AST fragment
 * back into source text. The output uses a single space around binary/logical
 * operators and no extra whitespace inside parentheses or argument lists,
 * which keeps generated fixes consistent regardless of the original formatting.
 *
 * Falls back to {@link readNodeText} for unrecognised node types so that
 * unhandled constructs preserve whatever text the parser captured.
 *
 * @param node - The expression AST node to render.
 * @param sourceText - The full GML source string (used as a fallback via
 *   {@link readNodeText} for unrecognised node types).
 * @returns A GML source string for the expression, or an empty string when the
 *   node is absent or not an object.
 */
export function printExpression(node: any, sourceText: string): string {
    if (!node || typeof node !== "object") {
        return "";
    }

    switch (node.type) {
        case "Literal": {
            return String(node.value);
        }
        case "Identifier": {
            return node.name;
        }
        case "ParenthesizedExpression": {
            const inner = node.expression ? printExpression(node.expression, sourceText) : "";
            return `(${inner})`;
        }
        case "BinaryExpression": {
            const left = printExpression(node.left, sourceText);
            const right = printExpression(node.right, sourceText);
            return `${left} ${node.operator} ${right}`;
        }
        case "LogicalExpression": {
            const left = printExpression(node.left, sourceText);
            const right = printExpression(node.right, sourceText);
            return `${left} ${node.operator} ${right}`;
        }
        case "UnaryExpression": {
            const arg = printExpression(node.argument, sourceText);
            if (node.prefix) {
                return `${node.operator}${arg}`;
            }
            return `${arg}${node.operator}`;
        }
        case "CallExpression": {
            const callee = printExpression(node.object || node.callee, sourceText);
            const args = Array.isArray(node.arguments)
                ? node.arguments.map((a: any) => printExpression(a, sourceText)).join(", ")
                : "";
            return `${callee}(${args})`;
        }
        case "MemberDotExpression": {
            const object = printExpression(node.object, sourceText);
            const property = printExpression(node.property, sourceText);
            return `${object}.${property}`;
        }
        case "MemberIndexExpression": {
            const object = printExpression(node.object, sourceText);
            const index = printExpression(node.index, sourceText);
            return `${object}[${index}]`;
        }
        case "ConditionalExpression": {
            const test = printExpression(node.test, sourceText);
            const consequent = printExpression(node.consequent, sourceText);
            const alternate = printExpression(node.alternate, sourceText);
            return `${test} ? ${consequent} : ${alternate}`;
        }
        case "AssignmentExpression": {
            const left = printExpression(node.left, sourceText);
            const right = printExpression(node.right, sourceText);
            return `${left} ${node.operator} ${right}`;
        }
        default: {
            const text = readNodeText(sourceText, node);
            return text || "";
        }
    }
}
