import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import {
    type AstNodeRecord,
    createMeta,
    getNodeEndIndex,
    getNodeStartIndex,
    isAstNodeRecord,
    isAstNodeWithType
} from "../rule-base-helpers.js";
import { shouldReportUnsafe } from "../rule-helpers.js";

function isStringLiteralExpression(expression: unknown): boolean {
    if (!isAstNodeRecord(expression) || expression.type !== "Literal") {
        return false;
    }
    if (typeof expression.value !== "string") {
        return false;
    }
    const raw = expression.value;
    if (raw.length < 2) {
        return false;
    }
    const first = raw.charAt(0);
    const last = raw.at(-1);
    if (first !== last) {
        return false;
    }
    if (first === '"' || first === "'") {
        return true;
    }
    return first === "@" && raw.charAt(1) === '"' && last === '"';
}

function getNodeTextFromContext(context: Rule.RuleContext, astNode: any): string {
    if (typeof context.getSourceCode === "function") {
        return context.getSourceCode().getText(astNode);
    }
    if (astNode && Array.isArray(astNode.range)) {
        const txt = context.sourceCode.text;
        const [start, end] = astNode.range;
        return txt.slice(start, end);
    }
    return "";
}

export function createPreferStringInterpolationRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const reportUnsafe = shouldReportUnsafe(context);

            function expressionContainsUnsafeMutation(node: unknown): boolean {
                if (!node || typeof node !== "object") {
                    return false;
                }

                if (Array.isArray(node)) {
                    return node.some((entry) => expressionContainsUnsafeMutation(entry));
                }

                const candidate = node as AstNodeRecord;
                if (candidate.type === "UpdateExpression" || candidate.type === "IncDecStatement") {
                    return true;
                }
                if (
                    candidate.type === "AssignmentExpression" &&
                    typeof candidate.operator === "string" &&
                    candidate.operator !== "="
                ) {
                    return true;
                }

                for (const [key, value] of Object.entries(candidate)) {
                    if (key === "parent") {
                        continue;
                    }
                    if (expressionContainsUnsafeMutation(value)) {
                        return true;
                    }
                }

                return false;
            }

            // helper shared between the Program walker and regular visitor
            function handleBinary(node: any) {
                if (node.operator !== "+") {
                    return;
                }

                if (isStringLiteralExpression(node.left) || isStringLiteralExpression(node.right)) {
                    if (!reportUnsafe && expressionContainsUnsafeMutation(node)) {
                        return;
                    }

                    context.report({
                        node,
                        messageId: definition.messageId,
                        fix(fixer) {
                            function buildTemplate(n: any): string {
                                // Recursively flatten concatenation chain
                                if (n && n.type === "BinaryExpression" && n.operator === "+") {
                                    return buildTemplate(n.left) + buildTemplate(n.right);
                                }

                                // string() call unwrap
                                if (
                                    n &&
                                    n.type === "CallExpression" &&
                                    // the parser sometimes uses `callee` (ESLint-style) but in
                                    // gml AST the function name is stored on an `object` field.
                                    // handle both to ensure our fixer unwraps `string()` calls no
                                    // matter which variant the AST happens to use.
                                    ((isAstNodeWithType(n.callee) &&
                                        n.callee.type === "Identifier" &&
                                        n.callee.name === "string") ||
                                        (isAstNodeWithType(n.object) &&
                                            n.object.type === "Identifier" &&
                                            n.object.name === "string")) &&
                                    Array.isArray(n.arguments) &&
                                    n.arguments.length === 1
                                ) {
                                    const arg = n.arguments[0];
                                    const inner = getNodeTextFromContext(context, arg);
                                    // only surround with braces – the dollar prefix belongs
                                    // on the final template literal, not each fragment
                                    return `{${inner}}`;
                                }

                                if (isAstNodeRecord(n) && n.type === "Literal" && typeof n.value === "string") {
                                    // strip surrounding quotes from literal text
                                    const txt = getNodeTextFromContext(context, n);
                                    // assume first and last char are quotes
                                    return txt.slice(1, -1);
                                }

                                // fallback expression – just wrap with braces
                                const txt = getNodeTextFromContext(context, n);
                                return `{${txt}}`;
                            }

                            const templateBody = buildTemplate(node);
                            const replacement = `$"${templateBody}"`;

                            // explicit range replacement for harness compatibility
                            const start = getNodeStartIndex(node as AstNodeRecord);
                            const end = getNodeEndIndex(node as AstNodeRecord);
                            return fixer.replaceTextRange([start, end], replacement);
                        }
                    });
                }
            }

            function traverse(node: any) {
                if (!node || typeof node !== "object") return;
                if (Array.isArray(node)) {
                    for (const child of node) traverse(child);
                    return;
                }

                if (node.type === "BinaryExpression") {
                    handleBinary(node);
                }

                for (const key of Object.keys(node)) {
                    if (key === "parent") continue;
                    traverse(node[key]);
                }
            }

            return Object.freeze({
                Program(node) {
                    traverse(node);
                },
                BinaryExpression(node) {
                    // still provide ESLint visitor for proper engine traversal
                    handleBinary(node);
                }
            });
        }
    });
}
