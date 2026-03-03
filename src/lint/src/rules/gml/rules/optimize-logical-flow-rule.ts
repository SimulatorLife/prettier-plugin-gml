import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import { printExpression } from "../../../language/print-expression.js";
import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";
import { applyLogicalNormalization } from "../transforms/logical-expressions/traversal-normalization.js";

/**
 * Normalize whitespace for structural expression comparisons.
 */
function normalizeWhitespaceForComparison(value: string): string {
    return value.replaceAll(/\s+/g, " ");
}

/**
 * Returns true when the given text range contains at least one line comment
 * or block comment.
 *
 * The GML parser attaches all comments to the Program-level `comments` array
 * rather than to individual AST nodes, so `Core.hasComment(node)` cannot be
 * relied upon inside lint-rule visitors. This helper scans the raw source text
 * instead.
 */
function rangeContainsComment(sourceText: string, start: number, end: number): boolean {
    let index = start;
    while (index < end - 1) {
        const ch = sourceText[index];
        if (ch === "/" && sourceText[index + 1] === "/") {
            return true;
        }
        if (ch === "/" && sourceText[index + 1] === "*") {
            return true;
        }
        // Skip string literals to avoid false positives from `//` inside strings.
        if (ch === '"') {
            index++;
            while (index < end && sourceText[index] !== '"') {
                if (sourceText[index] === "\\") {
                    index++;
                }
                index++;
            }
        }
        index++;
    }
    return false;
}

function resolveSafeNodeLoc(context: Rule.RuleContext, node: unknown): { line: number; column: number } {
    const sourceText = context.sourceCode.text;
    const rawStart = Core.getNodeStartIndex(node as any);
    const startIndex =
        typeof rawStart === "number" && Number.isFinite(rawStart) ? Core.clamp(rawStart, 0, sourceText.length) : 0;
    const sourceCodeWithLocator = context.sourceCode as Rule.RuleContext["sourceCode"] & {
        getLocFromIndex?: (index: number) => { line: number; column: number } | undefined;
    };
    const located =
        typeof sourceCodeWithLocator.getLocFromIndex === "function"
            ? sourceCodeWithLocator.getLocFromIndex(startIndex)
            : undefined;
    if (
        located &&
        typeof located.line === "number" &&
        typeof located.column === "number" &&
        Number.isFinite(located.line) &&
        Number.isFinite(located.column)
    ) {
        return located;
    }

    let line = 1;
    let lastLineStart = 0;
    for (let index = 0; index < startIndex; index += 1) {
        if (sourceText[index] === "\n") {
            line += 1;
            lastLineStart = index + 1;
        }
    }

    return {
        line,
        column: startIndex - lastLineStart
    };
}

export function createOptimizeLogicalFlowRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                // Using a broad selector or Program traversal
                // We'll iterate over nodes that are candidates for simplification.
                // Candidates: LogicalExpression, UnaryExpression (!), IfStatement.

                "LogicalExpression, UnaryExpression[operator='!'], IfStatement"(node: any) {
                    const originalNode = node;
                    const nodeStart = Core.getNodeStartIndex(originalNode);
                    const nodeEnd = Core.getNodeEndIndex(originalNode);
                    if (
                        typeof nodeStart !== "number" ||
                        typeof nodeEnd !== "number" ||
                        !Number.isFinite(nodeStart) ||
                        !Number.isFinite(nodeEnd) ||
                        nodeEnd <= nodeStart
                    ) {
                        return;
                    }

                    // For IfStatement boolean-return simplification: skip when the
                    // node's source range contains comments, since collapsing the
                    // if/else structure would silently discard them. The GML parser
                    // attaches all comments to the Program node rather than to
                    // individual child nodes, so Core.hasComment() is unreliable
                    // here; we therefore scan the text range for comment syntax.
                    if (
                        originalNode.type === "IfStatement" &&
                        rangeContainsComment(context.sourceCode.text, nodeStart, nodeEnd)
                    ) {
                        return;
                    }

                    const cloned = Core.cloneAstNode(node) as any;
                    applyLogicalNormalization(cloned);

                    const sourceText = context.sourceCode.text.slice(nodeStart, nodeEnd);
                    const newText = printExpression(cloned, context.sourceCode.text);

                    if (normalizeWhitespaceForComparison(sourceText) !== normalizeWhitespaceForComparison(newText)) {
                        context.report({
                            loc: resolveSafeNodeLoc(context, originalNode),
                            messageId: definition.messageId,
                            fix(fixer) {
                                return fixer.replaceTextRange([nodeStart, nodeEnd], newText);
                            }
                        });
                    }
                }
            });
        }
    });
}
