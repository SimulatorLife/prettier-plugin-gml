import { getNodeEndIndex, getNodeStartIndex } from "./locations.js";

export function readNodeText(sourceText: string, node: any): string | null {
    if (!node || typeof node !== "object") {
        return null;
    }
    const start = getNodeStartIndex(node);
    const end = getNodeEndIndex(node);
    if (typeof start === "number" && typeof end === "number") {
        return sourceText.slice(start, end);
    }
    return null;
}

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
        case "ReturnStatement": {
            // Synthetic ReturnStatement nodes produced by traversal transforms
            // (e.g. the if-else-boolean-return simplification) need explicit
            // printing so the lint-rule comparison detects the change and
            // produces correct replacement text.
            const arg = node.argument ? ` ${printExpression(node.argument, sourceText)}` : "";
            return `return${arg};`;
        }
        default: {
            const text = readNodeText(sourceText, node);
            return text || "";
        }
    }
}
