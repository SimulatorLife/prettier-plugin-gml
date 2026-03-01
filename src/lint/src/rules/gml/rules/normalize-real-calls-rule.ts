/**
 * Lint rule: gml/normalize-real-calls
 *
 * Detects calls to the built-in `real()` function with a static string literal
 * argument that contains a numeric value, and replaces the whole call expression
 * with the unwrapped numeric literal.
 *
 * Example:
 *   real("1.5")  →  1.5
 *   real("42")   →  42
 *   REAL("0.5")  →  0.5   (GML identifiers are case-insensitive)
 *
 * Ownership rationale (target-state.md §2.1, §3.2):
 *   Replacing `real("5")` with `5` requires understanding the *semantics* of
 *   the `real()` built-in — it is not a pure layout or lexical-canonicalization
 *   step. Semantic content rewrites must live in the `lint` workspace, not the
 *   formatter. The formatter must only perform layout and canonical rendering
 *   transforms (indentation, spacing, operator style, etc.).
 */
import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, walkAstNodes } from "../rule-base-helpers.js";

const { getNodeStartIndex, getNodeEndIndex, isCallExpressionIdentifierMatch, getCallExpressionArguments } =
    CoreWorkspace.Core;

/** Matches a bare or quoted numeric string, including optional sign and exponent. */
const NUMERIC_STRING_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Strips surrounding quotes from a GML string literal raw value.
 *
 * Handles double-quoted (`"…"`), single-quoted (`'…'`), and verbatim
 * (`@"…"`) GML string forms. Returns `null` when the input does not match any
 * recognized quoted form.
 */
function extractStringLiteralContent(rawValue: string): string | null {
    if (rawValue.startsWith('@"') && rawValue.endsWith('"')) {
        return rawValue.slice(2, -1);
    }

    if (rawValue.length < 2) {
        return null;
    }

    const openQuote = rawValue[0];
    const closeQuote = rawValue.at(-1);

    if ((openQuote !== '"' && openQuote !== "'") || openQuote !== closeQuote) {
        return null;
    }

    return rawValue.slice(1, -1);
}

/**
 * Extracts the numeric text from a string literal node whose raw value
 * represents a number (e.g. the node for `"1.5"` → returns `"1.5"`).
 *
 * Returns `null` when the node is not a quoted numeric string literal.
 */
function resolveNumericStringFromLiteralNode(literalNode: unknown): string | null {
    if (!literalNode || typeof literalNode !== "object") {
        return null;
    }

    if ((literalNode as { type?: unknown }).type !== "Literal") {
        return null;
    }

    const rawValue = (literalNode as { value?: unknown }).value;
    if (typeof rawValue !== "string") {
        return null;
    }

    const content = extractStringLiteralContent(rawValue);
    if (content === null) {
        return null;
    }

    const trimmed = content.trim();
    return NUMERIC_STRING_PATTERN.test(trimmed) ? trimmed : null;
}

export function createNormalizeRealCallsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(program) {
                    walkAstNodes(program, (node) => {
                        if (!isCallExpressionIdentifierMatch(node, "real", { caseInsensitive: true })) {
                            return;
                        }

                        const args = getCallExpressionArguments(node);
                        if (args.length !== 1) {
                            return;
                        }

                        const numericText = resolveNumericStringFromLiteralNode(args[0]);
                        if (numericText === null) {
                            return;
                        }

                        const start = getNodeStartIndex(node);
                        const end = getNodeEndIndex(node);
                        if (typeof start !== "number" || typeof end !== "number") {
                            return;
                        }

                        context.report({
                            loc: context.sourceCode.getLocFromIndex(start),
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([start, end], numericText)
                        });
                    });
                }
            });
        }
    });
}
