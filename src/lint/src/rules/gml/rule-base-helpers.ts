import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../catalog.js";

const {
    isObjectLike,
    getNodeStartIndex,
    getNodeEndIndex,
    getCallExpressionIdentifierName,
    getCallExpressionArguments
} = CoreWorkspace.Core;

export { getCallExpressionArguments, getCallExpressionIdentifierName, getNodeEndIndex, getNodeStartIndex };

export function getLineStartOffset(sourceText: string, offset: number): number {
    return sourceText.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

export function getLineIndentationAtOffset(sourceText: string, offset: number): string {
    const lineStart = getLineStartOffset(sourceText, offset);
    let cursor = lineStart;
    while (cursor < sourceText.length && (sourceText[cursor] === " " || sourceText[cursor] === "\t")) {
        cursor += 1;
    }

    return sourceText.slice(lineStart, cursor);
}

export type AstNodeRecord = Record<string, unknown>;

export function isAstNodeRecord(value: unknown): value is AstNodeRecord {
    return isObjectLike(value) && !Array.isArray(value);
}

export type AstNodeWithType = AstNodeRecord & Readonly<{ type: string }>;

export function isAstNodeWithType(value: unknown): value is AstNodeWithType {
    return isAstNodeRecord(value) && typeof value.type === "string";
}

export function isCommentOnlyLine(line: string): boolean {
    // returns true if the line consists solely of whitespace and/or comment tokens
    // (single-line comments or block comments). This is a simple heuristic used by
    // some lint rules to identify separation barriers between logic groups.
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return true;
    }
    // startsWith is safe since we already trimmed whitespace
    return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.endsWith("*/");
}

export type AstNodeParentVisitContext = Readonly<{
    node: AstNodeWithType;
    parent: AstNodeWithType | null;
    parentKey: string | null;
    parentIndex: number | null;
}>;

export interface SourceTextEdit {
    readonly start: number;
    readonly end: number;
    readonly text: string;
}

export function createMeta(definition: GmlRuleDefinition): Rule.RuleMetaData {
    const docs = {
        description: `Rule for ${definition.messageId}.`,
        recommended: false,
        requiresProjectContext: false
    };

    const messages: Record<string, string> = {
        [definition.messageId]: `${definition.messageId} diagnostic.`,
        unsafeFix: "[unsafe-fix:SEMANTIC_AMBIGUITY] Unsafe fix omitted."
    };

    return Object.freeze({
        type: "suggestion",
        fixable: "code",
        docs: Object.freeze(docs),
        schema: definition.schema,
        messages: Object.freeze(messages)
    });
}

export function walkAstNodesWithParent(root: unknown, visit: (context: AstNodeParentVisitContext) => void): void {
    const pending: Array<AstNodeParentVisitContext> = [];
    if (isAstNodeWithType(root)) {
        pending.push({
            node: root,
            parent: null,
            parentKey: null,
            parentIndex: null
        });
    }

    const seen = new WeakSet<object>();
    while (pending.length > 0) {
        const current = pending.pop();
        if (!current) {
            continue;
        }

        const { node } = current;
        if (seen.has(node)) {
            continue;
        }

        seen.add(node);
        visit(current);

        for (const key of Object.keys(node)) {
            if (key === "parent") {
                continue;
            }

            const value = node[key];
            if (Array.isArray(value)) {
                for (let index = value.length - 1; index >= 0; index -= 1) {
                    const childNode = value[index];
                    if (!isAstNodeWithType(childNode)) {
                        continue;
                    }

                    pending.push({
                        node: childNode,
                        parent: node,
                        parentKey: key,
                        parentIndex: index
                    });
                }
                continue;
            }

            if (!isAstNodeWithType(value)) {
                continue;
            }

            pending.push({
                node: value,
                parent: node,
                parentKey: key,
                parentIndex: null
            });
        }
    }
}

function walkAstNodesUntil(root: unknown, visit: (node: object) => boolean): void {
    if (!root || typeof root !== "object") {
        return;
    }

    const visited = new WeakSet<object>();
    const stack: unknown[] = [root];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== "object") {
            continue;
        }

        if (Array.isArray(current)) {
            for (let index = current.length - 1; index >= 0; index -= 1) {
                stack.push(current[index]);
            }
            continue;
        }

        if (visited.has(current)) {
            continue;
        }

        visited.add(current);
        if (visit(current)) {
            return;
        }

        for (const key of Object.keys(current)) {
            if (key === "parent") {
                continue;
            }

            const value = current[key];
            if (!value || typeof value !== "object") {
                continue;
            }

            stack.push(value);
        }
    }
}

export function walkAstNodes(root: unknown, visit: (node: any) => void) {
    walkAstNodesUntil(root, (node) => {
        visit(node);
        return false;
    });
}

/**
 * Performs a depth-first search over an AST rooted at `root`, returning the
 * first non-array node for which `predicate` returns `true`, or `null` if no
 * match is found.
 *
 * This helper consolidates the boilerplate DFS traversal that was previously
 * duplicated across several near-identical `find*` functions (e.g.
 * `findAssignmentExpressionForRight`, `findVariableDeclaratorForInit`,
 * `findVariableDeclarationByName`) in the math transform helpers. Each caller
 * only needs to supply the match condition; the traversal mechanics are handled
 * here once.
 *
 * Traversal notes:
 * - `parent` keys are skipped to avoid re-visiting ancestors.
 * - Cycles are guarded with a `WeakSet`.
 * - Arrays are expanded in-place; elements are visited in source order.
 */
export function findFirstAstNodeBy(root: unknown, predicate: (node: any) => boolean): AstNodeRecord | null {
    let matchedNode: AstNodeRecord | null = null;
    walkAstNodesUntil(root, (node) => {
        if (!isAstNodeRecord(node)) {
            return false;
        }

        if (!predicate(node)) {
            return false;
        }

        matchedNode = node;
        return true;
    });

    return matchedNode;
}

export function findFirstChangedCharacterOffset(originalText: string, rewrittenText: string): number {
    const minLength = Math.min(originalText.length, rewrittenText.length);
    for (let index = 0; index < minLength; index += 1) {
        if (originalText[index] !== rewrittenText[index]) {
            return index;
        }
    }

    if (originalText.length !== rewrittenText.length) {
        return minLength;
    }

    return 0;
}

/**
 * Resolves a `{ line, column }` location from a character offset within the
 * current rule context's source text.
 *
 * The ESLint `sourceCode.getLocFromIndex` API is tried first. When it is
 * unavailable or returns a non-finite result, this function falls back to a
 * manual newline scan so that every rule can produce a valid report location
 * regardless of the ESLint version in use.
 *
 * This function consolidates three previously duplicated implementations:
 * - `resolveReportLoc` in `create-feather-rule.ts`
 * - `resolveSafeLocFromIndex` in `prefer-loop-length-hoist-rule.ts`
 * - `resolveSafeNodeLoc` in `optimize-logical-flow-rule.ts`
 *
 * @param context ESLint rule context providing the source text and optional
 *   `getLocFromIndex` API.
 * @param index Zero-based character offset within the source text.
 * @returns A `{ line, column }` pair suitable for `context.report({ loc })`.
 */
export function resolveLocFromIndex(
    context: Rule.RuleContext,
    index: number
): { line: number; column: number } {
    const sourceText = context.sourceCode.text;
    const clampedIndex = Math.max(0, Math.min(index, sourceText.length));
    const sourceCodeWithLocator = context.sourceCode as Rule.RuleContext["sourceCode"] & {
        getLocFromIndex?: (index: number) => { line: number; column: number } | undefined;
    };
    const located =
        typeof sourceCodeWithLocator.getLocFromIndex === "function"
            ? sourceCodeWithLocator.getLocFromIndex(clampedIndex)
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
    for (let cursor = 0; cursor < clampedIndex; cursor += 1) {
        if (sourceText[cursor] === "\n") {
            line += 1;
            lastLineStart = cursor + 1;
        }
    }

    return { line, column: clampedIndex - lastLineStart };
}

export function reportFullTextRewrite(
    context: Rule.RuleContext,
    messageId: string,
    originalText: string,
    rewrittenText: string
): void {
    if (rewrittenText === originalText) {
        return;
    }

    const firstChangedOffset = findFirstChangedCharacterOffset(originalText, rewrittenText);
    context.report({
        loc: resolveLocFromIndex(context, firstChangedOffset),
        messageId,
        fix: (fixer) => fixer.replaceTextRange([0, originalText.length], rewrittenText)
    });
}

export function applySourceTextEdits(sourceText: string, edits: ReadonlyArray<SourceTextEdit>): string {
    if (edits.length === 0) {
        return sourceText;
    }

    const ordered = [...edits].toSorted((left, right) => right.start - left.start);
    let rewritten = sourceText;
    for (const edit of ordered) {
        if (edit.start < 0 || edit.end < edit.start || edit.end > rewritten.length) {
            continue;
        }

        rewritten = `${rewritten.slice(0, edit.start)}${edit.text}${rewritten.slice(edit.end)}`;
    }

    return rewritten;
}

export function computeLineStartOffsets(sourceText: string): Array<number> {
    const offsets = [0];
    for (let index = 0; index < sourceText.length; index += 1) {
        const character = sourceText[index];
        if (character === "\r" && sourceText[index + 1] === "\n") {
            offsets.push(index + 2);
            index += 1;
            continue;
        }

        if (character === "\n") {
            offsets.push(index + 1);
        }
    }

    return offsets;
}

export function getLineIndexForOffset(lineStartOffsets: ReadonlyArray<number>, offset: number): number {
    if (lineStartOffsets.length === 0 || offset <= 0) {
        return 0;
    }

    let low = 0;
    let high = lineStartOffsets.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const lineStart = lineStartOffsets[middle] ?? 0;
        const nextLineStart =
            middle + 1 < lineStartOffsets.length
                ? (lineStartOffsets[middle + 1] ?? Number.MAX_SAFE_INTEGER)
                : Number.MAX_SAFE_INTEGER;
        if (offset < lineStart) {
            high = middle - 1;
            continue;
        }
        if (offset >= nextLineStart) {
            low = middle + 1;
            continue;
        }
        return middle;
    }

    return Math.max(0, Math.min(lineStartOffsets.length - 1, low));
}

export function findMatchingBraceEndIndex(sourceText: string, openBraceIndex: number): number {
    let braceDepth = 0;
    for (let index = openBraceIndex; index < sourceText.length; index += 1) {
        const character = sourceText[index];
        if (character === "{") {
            braceDepth += 1;
            continue;
        }

        if (character !== "}") {
            continue;
        }

        braceDepth -= 1;
        if (braceDepth === 0) {
            return index + 1;
        }
    }

    return -1;
}

export function readLineIndentationBeforeOffset(sourceText: string, offset: number): string {
    const boundedOffset = Math.max(0, Math.min(offset, sourceText.length));
    let lineStart = sourceText.lastIndexOf("\n", boundedOffset - 1);
    if (lineStart < 0) {
        lineStart = 0;
    } else {
        lineStart += 1;
    }

    const prefix = sourceText.slice(lineStart, boundedOffset);
    const indentationMatch = /^[\t ]*/u.exec(prefix);
    return indentationMatch?.[0] ?? "";
}

/**
 * Collect all identifier names reachable from any AST subtree or statement
 * list. Works for a single node, an array of statements, or any object-like
 * root since the underlying {@link walkAstNodes} expands arrays encountered
 * during traversal.
 */
export function collectIdentifierNamesInSubtree(root: unknown): ReadonlySet<string> {
    const identifierNames = new Set<string>();
    walkAstNodes(root, (node) => {
        if (!isAstNodeRecord(node) || node.type !== "Identifier" || typeof node.name !== "string") {
            return;
        }

        identifierNames.add(node.name);
    });

    return identifierNames;
}

export function getVariableDeclarator(statement: unknown): AstNodeRecord | null {
    if (!isAstNodeRecord(statement)) {
        return null;
    }

    if (statement.type === "VariableDeclarator") {
        return statement;
    }

    if (statement.type === "VariableDeclaration") {
        const declarations = statement.declarations;
        if (Array.isArray(declarations) && declarations.length === 1) {
            const firstChild = declarations[0];
            if (isAstNodeRecord(firstChild) && firstChild.type === "VariableDeclarator") {
                return firstChild;
            }
        }
    }

    return null;
}
