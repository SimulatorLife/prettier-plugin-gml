import { Core } from "@gml-modules/core";
import type { AstPath } from "prettier";

const { isObjectLike } = Core;

// Helpers focused solely on semicolon emission rules within the printer.

const STRING_TYPE = "string";

// Cached regex pattern for whitespace detection to avoid recreating it on every
// character check. This single pattern matches all 25 standard JavaScript
// whitespace characters (ASCII and Unicode).
const WHITESPACE_REGEX = /\s/;

// Using a Set avoids re-allocating the list for every membership check when
// these helpers run inside tight printer loops.
const NODE_TYPES_REQUIRING_SEMICOLON = new Set([
    "CallExpression",
    "AssignmentExpression",
    "ExpressionStatement",
    "GlobalVarStatement",
    "ReturnStatement",
    "BreakStatement",
    "ContinueStatement",
    "ExitStatement",
    "ThrowStatement",
    "IncDecStatement",
    "VariableDeclaration",
    "DeleteStatement"
]);

/**
 * Identify whitespace characters that the printer treats as skippable when
 * trimming semicolons. Uses JavaScript's standard whitespace classification
 * (`\s` regex) to handle all Unicode whitespace characters, not just the
 * basic ASCII subset.
 *
 * This generalized approach ensures the formatter correctly processes GML
 * code containing any valid whitespace character, including Unicode spaces
 * that may appear when code is copied from external sources or IDEs.
 *
 * @param {number} charCode Character code to classify.
 * @returns {boolean} `true` when the character is whitespace.
 */
function isWhitespaceCharacterCode(charCode: number) {
    // Test the character against JavaScript's whitespace regex pattern.
    // This handles all 25 standard whitespace characters including:
    // - ASCII whitespace: tab(9), LF(10), VT(11), FF(12), CR(13), space(32)
    // - Unicode whitespace: NBSP(160), em-space(8195), etc.
    return WHITESPACE_REGEX.test(String.fromCharCode(charCode));
}

/**
 * Guard helper for {@link optionalSemicolon} to keep the membership logic
 * centralized. The printer ends up consulting this list in several hot paths,
 * so caching the lookup in a `Set` keeps call sites tidy without introducing
 * repeated allocations.
 *
 * @param {string | undefined} type Node `type` value to evaluate.
 * @returns {boolean} `true` when the node type must be terminated with a
 *                    semicolon.
 */
function nodeTypeNeedsSemicolon(type?: string) {
    return type ? NODE_TYPES_REQUIRING_SEMICOLON.has(type) : false;
}

/**
 * Convenience wrapper that returns the semicolon literal only when the printer
 * recognizes the node type as statement-terminating. Returning an empty string
 * avoids conditional logic at each call site and keeps the control flow easy to
 * scan within template literal builders.
 *
 * @param {string | undefined} nodeType AST node `type` to evaluate.
 * @returns {"" | ";"} Semicolon string when required, otherwise an empty string.
 */
export function optionalSemicolon(nodeType?: string) {
    return nodeTypeNeedsSemicolon(nodeType) ? ";" : "";
}

/**
 * Return the next character that is not recognized as whitespace, or `null`
 * when the search reaches the end of the provided text.
 *
 * @param {string | null | undefined} text Source text inspected for a meaningful token.
 * @param {number} startIndex Index to begin scanning from.
 * @returns {string | null} Next non-whitespace character or `null`.
 */
export function getNextNonWhitespaceCharacter(text: string | null | undefined, startIndex: number) {
    if (typeof text !== STRING_TYPE) {
        return null;
    }

    const { length } = text;
    for (let index = startIndex; index < length; index += 1) {
        const characterCode = text.charCodeAt(index);

        if (isWhitespaceCharacterCode(characterCode)) {
            continue;
        }

        return text.charAt(index);
    }

    return null;
}

/**
 * Count the number of trailing blank lines (consecutive newlines separated by
 * optional whitespace or semicolons) that follow the provided index. The
 * result is normalized so a single newline does not count as a blank line,
 * matching the printer's expectation that blank lines require at least one
 * empty line between statements.
 *
 * @param {string | null | undefined} text Source text to inspect.
 * @param {number} startIndex Index to begin scanning from.
 * @returns {number} Number of blank lines found after the start index.
 */
export function countTrailingBlankLines(text: string | null | undefined, startIndex: number) {
    if (typeof text !== STRING_TYPE) {
        return 0;
    }

    const { length } = text;
    let index = startIndex;
    let newlineCount = 0;

    while (index < length) {
        const characterCode = text.charCodeAt(index);

        if (characterCode === 59) {
            index += 1;
            continue;
        }

        if (characterCode === 10) {
            newlineCount += 1;
            index += 1;
            continue;
        }

        if (characterCode === 13) {
            newlineCount += 1;
            index += index + 1 < length && text.charCodeAt(index + 1) === 10 ? 2 : 1;
            continue;
        }

        if (isWhitespaceCharacterCode(characterCode)) {
            index += 1;
            continue;
        }

        break;
    }

    if (newlineCount === 0) {
        return 0;
    }

    return Math.max(0, newlineCount - 1);
}

/**
 * Determine whether the provided character code is one of the whitespace
 * characters that the semicolon cleanup logic considers skippable.
 *
 * @param {number} charCode Character code inspected for whitespace.
 * @returns {boolean} `true` when the code belongs to a skippable whitespace.
 */
export function isSkippableSemicolonWhitespace(charCode: number) {
    // The generalized isWhitespaceCharacterCode now handles all Unicode
    // whitespace via /\s/, including NBSP (160), line separator (0x2028), and
    // paragraph separator (0x2029) that GameMaker may serialize when copying
    // from the IDE or importing JSON exports.
    return isWhitespaceCharacterCode(charCode);
}

/**
 * Determine whether the AST path currently points to the final node in its
 * parent's `body` array. The printer relies on this classification when it
 * decides whether to emit trailing semicolons or preserve blank lines at the
 * end of a block without inspecting the broader sibling list manually.
 *
 * @param {AstPath<unknown>} path Printer AST path.
 * @returns {boolean} `true` when the path references the final statement.
 */
export function isLastStatement(path: AstPath<unknown>) {
    const body = getParentNodeListProperty(path);
    if (!body) {
        return true;
    }
    const node = path.getValue();

    const lastIndex = body.length - 1;
    return lastIndex >= 0 && body[lastIndex] === node;
}

function getParentNodeListProperty(path: AstPath<unknown>) {
    const parent = path.getParentNode();
    if (!parent) {
        return null;
    }
    return getNodeListProperty(parent);
}

function getNodeListProperty(node: unknown) {
    if (!isObjectLike(node)) {
        return null;
    }

    const maybeBody = (node as { body?: unknown }).body;
    return Array.isArray(maybeBody) ? maybeBody : null;
}
