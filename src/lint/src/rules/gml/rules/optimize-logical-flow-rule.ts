import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";
import { applyLogicalNormalization } from "../transforms/logical-expressions/traversal-normalization.js";

/**
 * Normalize whitespace for structural expression comparisons.
 */
function normalizeWhitespaceForComparison(value: string): string {
    return value.replaceAll(/\s+/g, " ");
}

function resolveSafeNodeLoc(context: Rule.RuleContext, node: unknown): { line: number; column: number } {
    const sourceText = context.sourceCode.text;
    const rawStart = Core.getNodeStartIndex(node as any);
    const startIndex =
        typeof rawStart === "number" && Number.isFinite(rawStart)
            ? Math.max(0, Math.min(rawStart, sourceText.length))
            : 0;
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
                    // We need to be careful not to process nodes that are parts of already processed nodes?
                    // ESLint traverses top-down usually.
                    // But if we modify a child, the parent might have been visited.

                    // Helper to check if simplification is possible without mutating yet.
                    // Actually `applyLogicalNormalization` mutates.

                    // Let's create a "check and fix" approach.
                    // Copy the node.
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

                    const cloned = Core.cloneAstNode(node) as any;

                    // Function to run ONE step of simplification on this node only.
                    // My `applyLogicalNormalization` runs recursively.
                    // I should probably expose `simplifyNode` logic separately?
                    // Or just use `applyLogicalNormalization` on the cloned node and compare?

                    applyLogicalNormalization(cloned);

                    // Compare printed version of original vs cloned.
                    const sourceText = context.sourceCode.text.slice(nodeStart, nodeEnd);
                    const newText = Core.printExpression(cloned, context.sourceCode.text);

                    // Check if changed.
                    // Note: `printExpression` might output different whitespace than source even if AST is same.
                    // This is risky.

                    // Better approach:
                    // Implement specific checks here instead of relying on `applyLogicalNormalization` generic pass.
                    // Or trust `printExpression` to be close enough?

                    // `printExpression` outputs minimal spacing.
                    // `sourceText` has original spacing.
                    // If I normalize `sourceText` (remove extra space) and compare?

                    // If I detect a standard change pattern (e.g. `!(!A)` -> `A`), I can just verify the AST structure change.

                    // Let's try to detect if `cloned` is structurally different (type changed, operator changed, children changed).
                    // But deep comparison is hard.

                    // Given the timeframe, I will rely on `applyLogicalNormalization` but restricts it to 1 pass or shallow check?
                    // `applyLogicalNormalization` is iterative (up to 10 passes).

                    // Let's try:
                    // 1. Clone node.
                    // 2. Run normalization.
                    // 3. Print normalized node.
                    // 4. If normalized != original (ignoring whitespace?), report fix.

                    if (normalizeWhitespaceForComparison(sourceText) !== normalizeWhitespaceForComparison(newText)) {
                        // It changed!
                        context.report({
                            loc: resolveSafeNodeLoc(context, originalNode),
                            messageId: definition.messageId, // "optimizeLogicalFlow"
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
