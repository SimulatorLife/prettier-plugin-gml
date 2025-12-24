import { isFunctionLikeNode } from "../../../ast/node-helpers.js";
import { getNodeStartIndex } from "../../../ast/locations.js";
import type { MutableGameMakerAstNode } from "../../../ast/types.js";
import { isLineComment } from "../../comment-utils.js";
import { resolveDocCommentTraversalService } from "../manager.js";
import { toNormalizedLowerCaseString } from "../../../utils/string.js";

type DocCommentTraversalService = {
    forEach(
        callback: (node: unknown, comments?: readonly unknown[] | null) => void
    ): void;
};

const PARAM_TAG_PATTERN = /@param\s+(?:\{[^}]+\}\s*)?(\S+)/i;
const FUNCTION_TAG_PATTERN = /@function\s+\w+\(([^)]*)\)/i;

function normalizeBoundaryIndex(index: unknown): number | null {
    return typeof index === "number" ? index : null;
}

function getCommentPositions(comment: unknown) {
    if (!comment || typeof comment !== "object") {
        return { start: null, end: null };
    }

    const { start, end } = comment as { start?: unknown; end?: unknown };

    return {
        start: normalizeBoundaryIndex(
            (start as { index?: unknown })?.index ?? start
        ),
        end: normalizeBoundaryIndex((end as { index?: unknown })?.index ?? end)
    };
}

/**
 * Retrieves the start index attached to a comment node for comparison.
 */
export function getCommentStartIndex(comment: unknown): number | null {
    return getCommentPositions(comment).start;
}

/**
 * Retrieves the end index attached to a comment node.
 */
export function getCommentEndIndex(comment: unknown): number | null {
    return getCommentPositions(comment).end;
}

/**
 * Determines whether the provided range contains only whitespace characters.
 */
export function isWhitespaceBetween(
    startIndex: number,
    endIndex: number,
    sourceText?: string | null
): boolean {
    if (!sourceText || typeof sourceText !== "string") {
        return true;
    }

    if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) {
        return true;
    }

    if (startIndex >= endIndex) {
        return true;
    }

    const fragment = sourceText.slice(startIndex, endIndex);
    return !/\S/.test(fragment);
}

/**
 * Extracts the parameter identifier referenced inside a doc-comment line.
 */
export function extractParamNameFromComment(value: string): string | null {
    const match = PARAM_TAG_PATTERN.exec(value);

    if (!match || typeof match[1] !== "string") {
        return null;
    }

    let name = match[1].trim();

    if (name.startsWith("[") && name.endsWith("]")) {
        name = name.slice(1, -1);
    }

    const equalsIndex = name.indexOf("=");
    if (equalsIndex !== -1) {
        name = name.slice(0, equalsIndex);
    }

    return name.trim() || null;
}

/**
 * Extracts the parameter names from a @function tag.
 */
export function extractFunctionTagParams(value: string): string[] {
    const match = FUNCTION_TAG_PATTERN.exec(value);

    if (!match || typeof match[1] !== "string") {
        return [];
    }

    return match[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * Normalizes a doc-comment parameter name for case-insensitive comparison.
 */
export function normalizeDocParamNameForComparison(name: unknown): string {
    return toNormalizedLowerCaseString(name);
}

/**
 * Reads the parameter names that appear in the doc comments preceding a
 * function-like node so consumers can detect which parameters already have
 * descriptions.
 */
export function extractDocumentedParamNames(
    functionNode: unknown,
    docComments: readonly unknown[] | null | undefined,
    sourceText?: string | null
): string[] {
    const documentedNames: string[] = [];

    if (!functionNode || typeof functionNode !== "object") {
        return documentedNames;
    }

    const startIndex = getNodeStartIndex(functionNode);
    if (!Number.isFinite(startIndex)) {
        return documentedNames;
    }

    const candidateComments = Array.isArray(docComments) ? docComments : [];

    // Check for @function tag first
    for (const comment of candidateComments) {
        if (isLineComment(comment) && typeof comment.value === "string") {
            const functionParams = extractFunctionTagParams(comment.value);
            if (functionParams.length > 0) {
                return functionParams;
            }
        }
    }

    const paramComments = candidateComments
        .filter(
            (comment): comment is { value: string } =>
                isLineComment(comment) &&
                typeof comment.value === "string" &&
                /@param\b/i.test(comment.value)
        )
        .sort((left, right) => {
            const leftPos = getCommentStartIndex(left);
            const rightPos = getCommentStartIndex(right);

            if (leftPos === rightPos) {
                return 0;
            }

            if (leftPos === null) {
                return -1;
            }

            if (rightPos === null) {
                return 1;
            }

            return leftPos - rightPos;
        });

    if (paramComments.length === 0) {
        return documentedNames;
    }

    let boundary = startIndex;
    let targetIndex = -1;

    for (let index = paramComments.length - 1; index >= 0; index -= 1) {
        const { end } = getCommentPositions(paramComments[index]);
        if (typeof end === "number" && end < startIndex) {
            targetIndex = index;
            break;
        }
    }

    if (targetIndex === -1) {
        return documentedNames;
    }

    for (let index = targetIndex; index >= 0; index -= 1) {
        const comment = paramComments[index];
        const { start, end } = getCommentPositions(comment);

        if (end === null || end >= boundary) {
            continue;
        }

        if (start !== null && start >= boundary) {
            continue;
        }

        if (!isWhitespaceBetween(end + 1, boundary, sourceText)) {
            break;
        }

        const name = extractParamNameFromComment(comment.value);
        if (!name) {
            break;
        }

        documentedNames.push(name);
        boundary = start ?? end;
    }

    return documentedNames.reverse();
}

/**
 * Builds a lookup that maps each function node to the parameters it documents
 * so transforms can reuse metadata without traversing the AST multiple times.
 */
export function buildDocumentedParamNameLookup(
    ast: unknown,
    sourceText?: string | null,
    docCommentTraversal?: DocCommentTraversalService | null
): WeakMap<MutableGameMakerAstNode, Set<string>> {
    const registry = new WeakMap<MutableGameMakerAstNode, Set<string>>();

    if (!ast || typeof ast !== "object") {
        return registry;
    }

    const traversal =
        docCommentTraversal ?? resolveDocCommentTraversalService(ast);

    traversal.forEach((node, comments = []) => {
        if (!isFunctionLikeNode(node)) {
            return;
        }

        const names = extractDocumentedParamNames(node, comments, sourceText);

        if (names.length === 0) {
            return;
        }

        // Store as Set for compatibility, but we might want to expose the array later
        // For now, consumers expect Set<string>.
        // But wait, I need the array for FeatherFix!

        // I'll attach the array to the node as metadata?
        // Or change the return type?

        // If I change the return type, I break consumers.
        // But I control the consumers.

        // Let's attach it to the node for now, to avoid breaking signature.
        node._documentedParamNamesOrdered = names;

        registry.set(node as MutableGameMakerAstNode, new Set(names));
    });

    return registry;
}
