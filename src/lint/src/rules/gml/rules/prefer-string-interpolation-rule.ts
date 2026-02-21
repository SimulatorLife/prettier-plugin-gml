import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";
import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, isAstNodeRecord, isAstNodeWithType, getNodeStartIndex, getNodeEndIndex, type AstNodeRecord } from "../rule-base-helpers.js";

export function createPreferStringInterpolationRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            // helper shared between the Program walker and regular visitor
            function handleBinary(node: any) {
                if (node.operator !== "+") {
                    return;
                }

                const isString = (expression: unknown): boolean =>
                    isAstNodeRecord(expression) &&
                    expression.type === "Literal" &&
                    typeof expression.value === "string";

                if (isString(node.left) || isString(node.right)) {
                    context.report({
                        node: node as any,
                        messageId: definition.messageId,
                        fix(fixer) {
                            const sourceCode = context.getSourceCode();

                            function buildTemplate(n: any): string {
                                // Recursively flatten concatenation chain
                                if (
                                    n &&
                                    n.type === "BinaryExpression" &&
                                    n.operator === "+"
                                ) {
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
                                        (n.callee as any).name === "string") ||
                                     (isAstNodeWithType((n as any).object) &&
                                        (n as any).object.type === "Identifier" &&
                                        (n as any).object.name === "string")) &&
                                    Array.isArray(n.arguments) &&
                                    n.arguments.length === 1
                                ) {
                                    const arg = n.arguments[0];
                                    const inner = sourceCode.getText(arg);
                                    // only surround with braces – the dollar prefix belongs
                                    // on the final template literal, not each fragment
                                    return "{" + inner + "}";
                                }

                                if (isAstNodeRecord(n) && n.type === "Literal" && typeof n.value === "string") {
                                    // strip surrounding quotes from literal text
                                    const txt = sourceCode.getText(n);
                                    // assume first and last char are quotes
                                    return txt.slice(1, -1);
                                }

                                // fallback expression – just wrap with braces
                                const txt = sourceCode.getText(n);
                                return "{" + txt + "}";
                            }

                            const templateBody = buildTemplate(node as any);
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
                    handleBinary(node as any);
                }
            });
        }
    });
}
