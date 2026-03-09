import { Core } from "@gml-modules/core";

const MEMBER_INDEX_ACCESSORS = new Set(["[", "[|", "[?", "[#", "[@", "[$"]);

/**
 * Converts a number that JavaScript's `toString()` would render in scientific
 * notation (e.g. `1e-11`) to an equivalent plain decimal string that is valid
 * in GML (e.g. `"0.00000000001"`).  Returns `null` on unexpected input.
 */
function scientificNotationToDecimal(value: number): string | null {
    if (!Number.isFinite(value)) {
        return null;
    }

    const isNegative = value < 0;
    const abs = Math.abs(value);
    const str = abs.toString();

    const eIndex = str.indexOf("e");
    if (eIndex === -1) {
        return isNegative ? `-${str}` : str;
    }

    const mantissaStr = str.slice(0, eIndex);
    const exponentStr = str.slice(eIndex + 1);
    const exponent = Number.parseInt(exponentStr, 10);
    if (!Number.isFinite(exponent)) {
        return null;
    }

    const dotIndex = mantissaStr.indexOf(".");
    const intPart = dotIndex === -1 ? mantissaStr : mantissaStr.slice(0, dotIndex);
    const fracPart = dotIndex === -1 ? "" : mantissaStr.slice(dotIndex + 1);
    const digits = `${intPart}${fracPart}`;
    const decimalPos = intPart.length + exponent;

    let result: string;
    if (decimalPos <= 0) {
        result = `0.${"0".repeat(-decimalPos)}${digits}`;
    } else if (decimalPos >= digits.length) {
        result = `${digits}${"0".repeat(decimalPos - digits.length)}`;
    } else {
        result = `${digits.slice(0, decimalPos)}.${digits.slice(decimalPos)}`;
    }

    // Trim trailing fractional zeros
    if (result.includes(".")) {
        result = result.replace(/\.?0+$/u, "");
    }

    return isNegative ? `-${result}` : result || "0";
}

/**
 * Reads the original source text associated with an AST node range.
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
 * Produces a minimal expression string for lint autofixes.
 */
export function printExpression(node: any, sourceText: string): string {
    if (!node || typeof node !== "object") {
        return "";
    }

    switch (node.type) {
        case "Literal": {
            const literalValue = node.value;
            if (typeof literalValue === "number" && Number.isFinite(literalValue)) {
                const asStr = String(literalValue);
                // GML does not support scientific-notation literals (e.g. "1e-11").
                // Prefer the original source text when available; otherwise convert
                // to a plain decimal string so the output is valid GML.
                if (asStr.includes("e") || asStr.includes("E")) {
                    const originalText = readNodeText(sourceText, node);
                    if (originalText !== null) {
                        return originalText;
                    }
                    return scientificNotationToDecimal(literalValue) ?? asStr;
                }
            }
            return String(literalValue);
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
                ? node.arguments.map((argument: any) => printExpression(argument, sourceText)).join(", ")
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
            const accessor =
                typeof node.accessor === "string" && MEMBER_INDEX_ACCESSORS.has(node.accessor) ? node.accessor : "[";
            let index: string;
            if (Array.isArray(node.property)) {
                index = node.property.map((entry: any) => printExpression(entry, sourceText)).join(", ");
            } else if (node.index) {
                index = printExpression(node.index, sourceText);
            } else {
                index = printExpression(node.property, sourceText);
            }
            return `${object}${accessor}${index}]`;
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
