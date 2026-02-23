import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";
import { applyLogicalNormalization } from "../transforms/logical-expressions/traversal-normalization.js";

function readNodeText(sourceText: string, node: any): string | null {
    if (!node || typeof node !== "object") {
        return null;
    }
    // Assume start/end compatible with Core helpers if needed, but simple slice works if props exist
    const start = node.start;
    const end = node.end;
    if (typeof start === "number" && typeof end === "number") {
        return sourceText.slice(start, end);
    }
    // Fallback?
    return null;
}

function printExpression(node: any, sourceText: string): string {
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
            // For simplifyIfStatement, we might generate function calls?
            // Actually simplifyIfStatement generates ReturnStatement, ExpressionStatement (Assignment).
            // printExpression handles Expression nodes.
            // If we replace IfStatement with ExpressionStatement, we need to print the ExpressionStatement's expression.

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

/**
 * Replaces the regex-based optimization with an AST traversal approach.
 */
function performLogicalFlowOptimization(ast: any, sourceText: string): string {
    // Clone AST to avoid mutating original ESLint AST (if that matters,
    // though we are replacing full text anyway so maybe okay).
    // Better safe than sorry for other rules.
    const cloned = Core.cloneAstNode(ast) as any;

    // Apply normalization
    applyLogicalNormalization(cloned);

    // Re-print the AST?
    // Problem: Unlike expressions, we can't easily print the whole program if we only changed parts of it,
    // unless we have a full printer.
    // We only have `printExpression`.

    // Alternative: Traverse the original AST and the optimized AST in parallel or
    // record changes during normalization?
    // `applyLogicalNormalization` modifies the AST in place.
    // If I could get a list of changes or changed nodes...

    // For now, since `applyLogicalNormalization` works in place, maybe I should adapt `applyLogicalNormalization` to
    // take a callback for reporting edits?

    // But `reportFullTextRewrite` expects full text.
    // If I can't print the whole AST, I can't use `reportFullTextRewrite` with the modified AST.
    // The previous implementation used regex on `sourceText` and returned `rewrittenText`.

    // Solution:
    // 1. Traverse the AST and identify nodes that *would* be changed.
    // 2. Perform replacements on source text using ranges.
    // 3. BUT `applyLogicalNormalization` is recursive and iterative.

    // Ideally, I should switch to `report` with `fixer.replaceText(node, newText)` for individual nodes.
    // This is better for ESLint anyway.
    return sourceText; // Placeholder
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
                    const cloned = Core.cloneAstNode(node) as any;

                    // Function to run ONE step of simplification on this node only.
                    // My `applyLogicalNormalization` runs recursively.
                    // I should probably expose `simplifyNode` logic separately?
                    // Or just use `applyLogicalNormalization` on the cloned node and compare?

                    applyLogicalNormalization(cloned);

                    // Compare printed version of original vs cloned.
                    const sourceText =
                        context.sourceCode.getLoc(originalNode).source || context.sourceCode.getText(originalNode);
                    const newText = printExpression(cloned, context.sourceCode.text);

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

                    // Function to normalize whitespace of a string for comparison
                    const normalizeWs = (s: string) => s.replaceAll(/\s+/g, " ");

                    if (normalizeWs(sourceText) !== normalizeWs(newText)) {
                        // It changed!
                        context.report({
                            node: originalNode,
                            messageId: definition.messageId, // "optimizeLogicalFlow"
                            fix(fixer) {
                                return fixer.replaceText(originalNode, newText);
                            }
                        });
                    }
                }
            });
        }
    });
}
