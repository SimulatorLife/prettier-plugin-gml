// Helpers focused solely on semicolon emission rules within the printer.

const STRING_TYPE = "string";

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
export function getNextNonWhitespaceCharacter(
    text: string | null | undefined,
    startIndex: number
) {
    if (typeof text !== STRING_TYPE) {
        return null;
    }

    const { length } = text;
    for (let index = startIndex; index < length; index += 1) {
        const characterCode = text.charCodeAt(index);

        switch (characterCode) {
            case 9: // \t
            case 10: // \n
            case 11: // vertical tab
            case 12: // form feed
            case 13: // \r
            case 32: {
                continue;
            }
            default: {
                return text.charAt(index);
            }
        }
    }

    return null;
}

/**
 * Count the number of trailing blank lines (consecutive newlines separated by
 * optional whitespace or semicolons) that follow the provided index.
 *
 * @param {string | null | undefined} text Source text to inspect.
 * @param {number} startIndex Index to begin scanning from.
 * @returns {number} Number of blank lines found after the start index.
 */
export function countTrailingBlankLines(
    text: string | null | undefined,
    startIndex: number
) {
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
            index +=
                index + 1 < length && text.charCodeAt(index + 1) === 10
                    ? 2
                    : 1;
            continue;
        }

        if (
            characterCode === 9 || // \t
            characterCode === 11 || // vertical tab
            characterCode === 12 || // form feed
            characterCode === 32 // space
        ) {
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
    // Mirrors the range of characters matched by /\s/ without incurring the
    // per-iteration RegExp machinery cost.
    switch (charCode) {
        case 9: // tab
        case 10: // line feed
        case 11: // vertical tab
        case 12: // form feed
        case 13: // carriage return
        case 32: // space
        case 160:
        case 0x20_28:
        case 0x20_29: {
            // GameMaker occasionally serializes or copy/pastes scripts with the
            // U+00A0 non-breaking space and the U+2028/U+2029 line and
            // paragraph separators—for example when creators paste snippets
            // from the IDE or import JSON exports. Treat them as
            // semicolon-trimmable whitespace so the cleanup logic keeps
            // matching GameMaker's parser expectations instead of leaving stray
            // semicolons behind.
            return true;
        }
        default: {
            return false;
        }
    }
}
