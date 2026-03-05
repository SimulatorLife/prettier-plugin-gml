import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import { printExpression } from "../../../language/print-expression.js";
import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";
import { applyLogicalNormalizationWithChangeMetadata } from "../transforms/logical-expressions/traversal-normalization.js";

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

/**
 * Returns `true` if the GML source text for a node's range contains a line or
 * block comment. Used to guard boolean-return simplifications so that
 * developer-visible annotations are never silently discarded.
 *
 * Note: the GML language plugin stores comments on the root `Program` node
 * rather than attaching them to individual statement nodes. We therefore scan
 * the raw source text while respecting string-literal boundaries to avoid
 * treating `//` or `/*` inside a string as a comment.
 */
function branchSourceContainsComment(sourceText: string, branchNode: any): boolean {
    const start = Core.getNodeStartIndex(branchNode);
    const end = Core.getNodeEndIndex(branchNode);
    if (typeof start !== "number" || typeof end !== "number") {
        return false;
    }

    const text = sourceText.slice(start, end);
    const len = text.length;

    for (let i = 0; i < len; i++) {
        const ch = text[i];

        // Skip over string literals so that `"http://example.com"` does not
        // trigger a false positive.
        if (ch === '"' || ch === "'") {
            const quote = ch;
            i++;
            while (i < len && text[i] !== quote) {
                if (text[i] === "\\") {
                    i++; // skip escaped character
                }
                i++;
            }
            continue;
        }

        if (ch === "/" && i + 1 < len && (text[i + 1] === "/" || text[i + 1] === "*")) {
            return true;
        }
    }

    return false;
}

/**
 * Resolves the boolean literal value of an AST node (`true` or `false`), or
 * `null` if the node is not a boolean literal.
 *
 * GML represents boolean literals as `Literal { value: "true" }` (string),
 * so we delegate to {@link Core.getBooleanLiteralValue} which handles both
 * string-encoded and boolean-primitive forms.
 */
function resolveBooleanLiteralValue(node: any): boolean | null {
    const raw = Core.getBooleanLiteralValue(node);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
}

/**
 * Unwraps a single-statement `BlockStatement` to its body statement.
 * Returns the original node if it is not a single-statement block.
 */
function unwrapSingleStatementBlock(node: any): any {
    if (node?.type === "BlockStatement") {
        const body: unknown[] = Array.isArray(node.body) ? node.body : [];
        return body.length === 1 ? body[0] : null;
    }
    return node;
}

/**
 * Returns the boolean value that a branch unconditionally returns, or `null`
 * when the branch does not match a single boolean-literal return.
 *
 * Accepts both bare `ReturnStatement` nodes and single-statement
 * `BlockStatement` wrappers. Comment detection is handled separately via
 * {@link branchSourceContainsComment}.
 */
function resolveBoolReturnBranch(branchNode: any): boolean | null {
    const stmt = unwrapSingleStatementBlock(branchNode);
    if (!stmt || stmt.type !== "ReturnStatement") {
        return null;
    }
    const argument = stmt.argument;
    if (!argument) {
        return null;
    }
    return resolveBooleanLiteralValue(argument);
}

/**
 * Returns `true` when negating `node` requires wrapping it in parentheses to
 * preserve operator-precedence semantics (e.g., `!(a and b)`).
 *
 * Logical, binary, assignment, and ternary expressions all bind more loosely
 * than unary `!`, so they must be parenthesised. Any enclosing
 * `ParenthesizedExpression` is unwrapped first so that `(a and b)` correctly
 * reports the inner `LogicalExpression` as needing parens.
 */
function negationRequiresParens(node: any): boolean {
    let unwrapped = node;
    while (unwrapped?.type === "ParenthesizedExpression") {
        unwrapped = unwrapped.expression;
    }
    const type: string = unwrapped?.type ?? "";
    return (
        type === "LogicalExpression" ||
        type === "BinaryExpression" ||
        type === "AssignmentExpression" ||
        type === "TernaryExpression"
    );
}

/**
 * Resolves the innermost expression by stripping any `ParenthesizedExpression`
 * wrappers, then returns its source text.
 *
 * The `if` statement's `test` node includes the surrounding parentheses as a
 * `ParenthesizedExpression` in the GML AST. We want the condition text without
 * those parens so the emitted `return <cond>` statement is correct.
 */
export function createOptimizeLogicalFlowRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                /**
                 * Simplifies `if (cond) { return true; } else { return false; }` →
                 * `return cond;` (or `return !(cond);` for the negated variant).
                 *
                 * This structural rewrite belongs in the linter per
                 * `target-state.md §2.1`, which requires the formatter to remain
                 * layout-only and prohibits semantic/content rewrites there.
                 */
                IfStatement(node: any) {
                    if (!node.alternate) {
                        return;
                    }

                    const nodeStart = Core.getNodeStartIndex(node);
                    const nodeEnd = Core.getNodeEndIndex(node);
                    if (
                        typeof nodeStart !== "number" ||
                        typeof nodeEnd !== "number" ||
                        !Number.isFinite(nodeStart) ||
                        !Number.isFinite(nodeEnd) ||
                        nodeEnd <= nodeStart
                    ) {
                        return;
                    }

                    // Guard: skip if the if-node itself or either branch contains a
                    // comment. The GML language plugin stores all comments on the
                    // root Program node rather than attaching them to individual
                    // statement nodes, so we scan the raw source text instead.
                    const sourceText = context.sourceCode.text;
                    if (
                        branchSourceContainsComment(sourceText, node.consequent) ||
                        branchSourceContainsComment(sourceText, node.alternate)
                    ) {
                        return;
                    }

                    const consequentBool = resolveBoolReturnBranch(node.consequent);
                    const alternateBool = resolveBoolReturnBranch(node.alternate);

                    if (consequentBool === null || alternateBool === null || consequentBool === alternateBool) {
                        return;
                    }

                    // Normalize the condition (e.g. remove double-negation) before
                    // using it in the replacement text so we don't emit `!!!flag_b`.
                    const clonedTest = Core.cloneAstNode(node.test) as any;
                    applyLogicalNormalizationWithChangeMetadata(clonedTest);
                    const condText = printExpression(clonedTest, sourceText);
                    if (!condText) {
                        return;
                    }

                    const isNegated = consequentBool === false;

                    let fixText: string;
                    if (isNegated) {
                        fixText = negationRequiresParens(clonedTest)
                            ? `return !(${condText});`
                            : `return !${condText};`;
                    } else {
                        fixText = `return ${condText};`;
                    }

                    context.report({
                        loc: resolveSafeNodeLoc(context, node),
                        messageId: definition.messageId,
                        fix(fixer) {
                            return fixer.replaceTextRange([nodeStart, nodeEnd], fixText);
                        }
                    });
                },

                /**
                 * Simplifies logical and unary expressions using algebraic
                 * normalization (double-negation removal, De Morgan's laws,
                 * absorption, etc.).
                 */
                "LogicalExpression, UnaryExpression[operator='!']"(node: any) {
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

                    const normalizationResult = applyLogicalNormalizationWithChangeMetadata(cloned);
                    if (!normalizationResult.changed) {
                        return;
                    }

                    const sourceText = context.sourceCode.text.slice(nodeStart, nodeEnd);
                    const newText = printExpression(normalizationResult.ast, context.sourceCode.text);

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
