import * as CoreWorkspace from "@gmloop/core";
import type { Rule } from "eslint";

import {
    applySourceTextEdits,
    createMeta,
    getNodeEndIndex,
    getNodeStartIndex,
    isAstNodeRecord,
    reportFullTextRewrite,
    type SourceTextEdit,
    walkAstNodesWithParent
} from "../rule-base-helpers.js";
import type { GmlRuleDefinition } from "../rule-definition.js";
import { isIdentifier } from "../rule-helpers.js";

type GlobalVarStatementRange = Readonly<{
    start: number;
    end: number;
    names: ReadonlyArray<string>;
}>;

function collectGlobalVarStatements(programNode: unknown): ReadonlyArray<GlobalVarStatementRange> {
    const statements: Array<GlobalVarStatementRange> = [];

    const visit = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element);
            }
            return;
        }

        if (!isAstNodeRecord(node)) {
            return;
        }

        if (node.type === "GlobalVarStatement") {
            const start = getNodeStartIndex(node);
            const endExclusive = getNodeEndIndex(node);
            if (typeof start === "number" && typeof endExclusive === "number") {
                const declarations = CoreWorkspace.Core.asArray<Record<string, unknown>>(node.declarations);
                const names = declarations
                    .map((declaration) => CoreWorkspace.Core.getIdentifierText(declaration.id ?? null))
                    .filter((name): name is string => isIdentifier(name));

                if (names.length > 0) {
                    statements.push(
                        Object.freeze({
                            start,
                            end: endExclusive,
                            names
                        })
                    );
                }
            }
        }

        CoreWorkspace.Core.forEachNodeChild(node, (childNode) => visit(childNode));
    };

    visit(programNode);
    return statements;
}

/**
 * Resolve the start offset of the line that contains `offset`, i.e. the index
 * of the character immediately after the preceding `\n` (or 0 for line 1).
 */
function resolveLineStart(sourceText: string, offset: number): number {
    const preceding = sourceText.lastIndexOf("\n", Math.max(0, offset - 1));
    return preceding === -1 ? 0 : preceding + 1;
}

/**
 * Resolve the exclusive end offset of the line that contains `offset`,
 * including any trailing `\n` so the entire line (and its terminator) is
 * captured by a `[lineStart, lineEnd)` half-open range.
 */
function resolveLineEnd(sourceText: string, offset: number): number {
    const next = sourceText.indexOf("\n", offset);
    return next === -1 ? sourceText.length : next + 1;
}

/**
 * Build the set of source-text edits needed to auto-fix all `globalvar`
 * violations in one pass:
 *
 *  1. Delete each `globalvar …;` statement line.
 *  2. Prefix every bare identifier that names a globalvar-declared variable
 *     with `global.`, skipping identifiers that are already accessed through a
 *     `global.xxx` member expression and skipping identifiers that appear
 *     inside the `globalvar` declaration itself (which is being deleted).
 */
function buildGlobalVarFixEdits(
    sourceText: string,
    programNode: unknown,
    statements: ReadonlyArray<GlobalVarStatementRange>
): ReadonlyArray<SourceTextEdit> {
    const globalVarNames = new Set<string>();
    const deletedRanges: Array<{ start: number; end: number }> = [];

    for (const stmt of statements) {
        for (const name of stmt.names) {
            globalVarNames.add(name);
        }
        // Capture the full line (including its newline terminator) so the
        // deletion does not leave a stray blank line in the output.
        const lineStart = resolveLineStart(sourceText, stmt.start);
        const lineEnd = resolveLineEnd(sourceText, stmt.end - 1);
        deletedRanges.push({ start: lineStart, end: lineEnd });
    }

    const edits: Array<SourceTextEdit> = [];

    // Deletion edits for globalvar statement lines.
    for (const range of deletedRanges) {
        edits.push({ start: range.start, end: range.end, text: "" });
    }

    // Identifier prefix edits: insert "global." before each bare reference.
    walkAstNodesWithParent(programNode, ({ node, parent, parentKey }) => {
        if (node.type !== "Identifier" || typeof node.name !== "string") {
            return;
        }

        if (!globalVarNames.has(node.name)) {
            return;
        }

        // Already accessed as global.xxx — the object side of a member
        // expression whose object is named "global".
        if (parent !== null && parent.type === "MemberDotExpression" && parentKey === "property") {
            return;
        }

        const start = getNodeStartIndex(node);
        if (typeof start !== "number") {
            return;
        }

        // Skip identifiers that sit inside a globalvar declaration being
        // deleted — we are removing the whole line, so prefixing them would
        // create a dangling "global.xxx" inside the deleted span.
        const isInsideDeletedRange = deletedRanges.some((range) => start >= range.start && start < range.end);
        if (isInsideDeletedRange) {
            return;
        }

        // Insert "global." immediately before the identifier.
        edits.push({ start, end: start, text: "global." });
    });

    return edits;
}

export function createNoGlobalvarRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition, { fixable: "code" }),
        create(context) {
            const listener: Rule.RuleListener = {
                Program(programNode) {
                    const globalVarStatements = collectGlobalVarStatements(programNode);
                    if (globalVarStatements.length === 0) {
                        return;
                    }

                    const sourceText = context.sourceCode.text;
                    const edits = buildGlobalVarFixEdits(sourceText, programNode, globalVarStatements);
                    const rewrittenText = applySourceTextEdits(sourceText, edits);

                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            };

            return Object.freeze(listener);
        }
    });
}
