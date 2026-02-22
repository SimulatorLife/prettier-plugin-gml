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

export function createPreferStringInterpolationRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            // helper shared between the Program walker and regular visitor
            function handleBinary(node: any) {
                if (node.operator !== "+") {
                    return;
                }

                // only true for actual string literals (including @"..." raw strings)
                const isString = (expression: unknown): boolean => {
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
                    const last = raw.charAt(raw.length - 1);
                    if (first !== last) {
                        return false;
                    }
                    // covered quote types
                    if (first === '"' || first === "'") {
                        return true;
                    }
                    // verbatim @"..." strings start with @ then quote
                    if (first === "@" && raw.charAt(1) === '"' && last === '"') {
                        return true;
                    }
                    return false;
                };

                if (isString(node.left) || isString(node.right)) {
                    context.report({
                        node,
                        messageId: definition.messageId,
                        fix(fixer) {
                            // helper for retrieving source text of a node that works in
                            // both real ESLint contexts (sourceCode object provided) and
                            // our lightweight test harness (only sourceCode.text exists).
                            const getText = (node: any): string => {
                                if (typeof context.getSourceCode === "function") {
                                    return context.getSourceCode().getText(node);
                                }
                                // harness fallback: use raw text and node.range
                                if (node && Array.isArray(node.range)) {
                                    const txt = context.sourceCode.text as string;
                                    const [start, end] = node.range;
                                    return txt.slice(start, end);
                                }
                                return "";
                            };

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
                                    const inner = getText(arg);
                                    // only surround with braces – the dollar prefix belongs
                                    // on the final template literal, not each fragment
                                    return `{${inner}}`;
                                }

                                if (isAstNodeRecord(n) && n.type === "Literal" && typeof n.value === "string") {
                                    // strip surrounding quotes from literal text
                                    const txt = getText(n);
                                    // assume first and last char are quotes
                                    return txt.slice(1, -1);
                                }

                                // fallback expression – just wrap with braces
                                const txt = getText(n);
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
