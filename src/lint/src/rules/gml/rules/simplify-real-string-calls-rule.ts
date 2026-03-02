/**
 * Lint rule: simplify-real-string-calls
 *
 * Enforces the formatter/linter boundary defined in target-state.md §3.2:
 * evaluating `real("numeric-string")` and replacing the call with the numeric
 * literal is a semantic content rewrite, not a layout operation, and therefore
 * belongs here in the lint workspace — not in `@gml-modules/format`.
 *
 * When a `real()` call receives a single string-literal argument whose content
 * is a valid numeric value, this rule reports the call and offers an auto-fix
 * that replaces the entire call expression with the bare numeric literal.
 *
 * Examples:
 *   real("42")     → 42
 *   real("3.14")   → 3.14
 *   real("1e5")    → 1e5
 *   real(42)       → no change  (argument is already a number literal)
 *   real(x)        → no change  (argument is not a string literal)
 */
import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex, getNodeStartIndex } from "../rule-base-helpers.js";

/**
 * Matches a valid GML/JavaScript numeric literal: optional sign, integer or
 * decimal digits, and an optional exponent. This is the same pattern the
 * formatter previously used in `real-call-value.ts`.
 */
const NUMERIC_STRING_LITERAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Extracts the inner string content from a double-quoted or verbatim GML string
 * literal node value.
 *
 * GML double-quoted strings are stored in the AST with surrounding double-quote
 * characters in the `value` field (e.g., `"42"` is stored as `'"42"'`).
 * Verbatim strings use the form `@"text"` and are also stored with delimiters.
 *
 * Note: single-quoted GML strings (`'text'`) are parsed as Identifier nodes by
 * the GML parser, not Literal nodes, so they are never matched by this rule.
 */
function extractStringLiteralContent(rawValue: string): string | null {
    if (rawValue.startsWith('@"') && rawValue.endsWith('"')) {
        return rawValue.slice(2, -1);
    }

    if (rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')) {
        return rawValue.slice(1, -1);
    }

    return null;
}

/**
 * Returns the numeric string content when the argument to `real()` is a
 * string literal with a valid numeric value, otherwise returns `null`.
 */
function extractNumericValueFromRealCall(node: unknown): string | null {
    if (!Core.isCallExpressionIdentifierMatch(node, "real", { caseInsensitive: true })) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node as Parameters<typeof Core.getCallExpressionArguments>[0]);
    if (args.length !== 1) {
        return null;
    }

    const argument = args[0];
    if (!argument || (argument as { type?: string }).type !== "Literal") {
        return null;
    }

    const rawValue = (argument as { value?: unknown }).value;
    if (typeof rawValue !== "string") {
        return null;
    }

    const content = extractStringLiteralContent(rawValue);
    if (content === null) {
        return null;
    }

    const trimmed = Core.toTrimmedString(content);
    return NUMERIC_STRING_LITERAL_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Creates the `gml/simplify-real-string-calls` ESLint rule.
 *
 * Replaces `real("numericString")` call expressions with the bare numeric
 * literal they evaluate to. This is a semantic content rewrite that belongs
 * in the lint workspace (target-state.md §3.2).
 */
export function createSimplifyRealStringCallsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                CallExpression(node: unknown) {
                    const numericValue = extractNumericValueFromRealCall(node);
                    if (numericValue === null) {
                        return;
                    }

                    const start = getNodeStartIndex(node);
                    const end = getNodeEndIndex(node);

                    if (typeof start !== "number" || typeof end !== "number") {
                        return;
                    }

                    context.report({
                        loc: (
                            context.sourceCode as { getLocFromIndex?: (i: number) => { line: number; column: number } }
                        ).getLocFromIndex?.(start) ?? { line: 1, column: start },
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([start, end], numericValue)
                    });
                }
            });
        }
    });
}
