/**
 * Adds missing commas between numeric arguments when argument separators have been omitted in source text.
 * The sanitizer emits index adjustments for downstream location remapping.
 */
import { Core } from "@gml-modules/core";

const FALLBACK_FORBIDDEN_CALLEE = [
    "if",
    "for",
    "while",
    "switch",
    "repeat",
    "return",
    "do",
    "case",
    "default",
    "with",
    "catch"
];

const FALLBACK_FORBIDDEN_PRECEDING = ["function", "constructor"];

let FORBIDDEN_CALLEE_IDENTIFIERS: Set<string> | null = null;
const FORBIDDEN_PRECEDING_IDENTIFIERS = new Set(FALLBACK_FORBIDDEN_PRECEDING);

/**
 * Clear the cached forbidden callee identifiers.
 *
 * This function should be called when the identifier metadata cache is cleared
 * to ensure consistency between the core cache and this module's cache.
 * It's primarily used in tests or when resetting the formatter's state.
 */
export function clearForbiddenCalleeIdentifiersCache(): void {
    FORBIDDEN_CALLEE_IDENTIFIERS = null;
}

/**
 * Lazily initialize the forbidden callee identifiers set.
 *
 * Defers loading the 1.3 MB identifier metadata until the sanitizer is first
 * invoked, reducing baseline memory footprint by ~1.3 MB for processes that
 * load this module but never call sanitizeMissingArgumentSeparators.
 *
 * The metadata is loaded once and cached in FORBIDDEN_CALLEE_IDENTIFIERS for
 * subsequent calls. Use clearForbiddenCalleeIdentifiersCache() to reset.
 */
function ensureForbiddenCalleeIdentifiers(): Set<string> {
    if (FORBIDDEN_CALLEE_IDENTIFIERS !== null) {
        return FORBIDDEN_CALLEE_IDENTIFIERS;
    }

    const identifierMetadataEntries = Core.normalizeIdentifierMetadataEntries(Core.getIdentifierMetadata());
    const keywordIdentifierNames = new Set<string>();

    for (const entry of identifierMetadataEntries) {
        if (entry.type === "keyword") {
            keywordIdentifierNames.add(entry.name);
        }
    }

    FORBIDDEN_CALLEE_IDENTIFIERS = new Set(FALLBACK_FORBIDDEN_CALLEE);
    for (const keyword of keywordIdentifierNames) {
        FORBIDDEN_CALLEE_IDENTIFIERS.add(keyword);
    }

    return FORBIDDEN_CALLEE_IDENTIFIERS;
}

interface SanitizeMissingSeparatorsResult {
    sourceText: unknown;
    indexAdjustments: Array<number> | null;
}

interface CallProcessingState {
    stringQuote: string | null;
    stringEscape: boolean;
    inLineComment: boolean;
    inBlockComment: boolean;
    /** Parenthesis nesting depth (only used by processCall, not by helper functions) */
    depth: number;
}

interface CallProcessingResult {
    index: number;
    modified: boolean;
}

/**
 * Creates initial state for processing a call expression.
 */
function createCallProcessingState(): CallProcessingState {
    return {
        stringQuote: null,
        stringEscape: false,
        inLineComment: false,
        inBlockComment: false,
        depth: 1
    };
}

/**
 * Advances the index through string literal content, updating state accordingly.
 */
function advanceThroughStringLiteral(text: string, currentIndex: number, state: CallProcessingState): number {
    const character = text[currentIndex];
    const nextIndex = currentIndex + 1;

    if (state.stringEscape) {
        state.stringEscape = false;
        return nextIndex;
    }

    if (character === "\\") {
        state.stringEscape = true;
        return nextIndex;
    }

    if (character === state.stringQuote) {
        state.stringQuote = null;
    }

    return nextIndex;
}

/**
 * Advances the index through comment content, updating state accordingly.
 * This function should only be called when state.inLineComment or state.inBlockComment is true.
 */
function advanceThroughComment(text: string, length: number, currentIndex: number, state: CallProcessingState): number {
    const character = text[currentIndex];
    const nextIndex = currentIndex + 1;

    if (state.inLineComment) {
        if (character === "\n") {
            state.inLineComment = false;
        }
        return nextIndex;
    }

    if (character === "*" && currentIndex + 1 < length && text[currentIndex + 1] === "/") {
        state.inBlockComment = false;
        return currentIndex + 2;
    }

    return nextIndex;
}

/**
 * Attempts to start tracking a string literal or comment.
 * Returns the new index if successful, or the original index if not applicable.
 */
function tryStartStringOrComment(
    text: string,
    length: number,
    currentIndex: number,
    state: CallProcessingState
): number {
    const character = text[currentIndex];

    if (character === "'" || character === '"' || character === "`") {
        state.stringQuote = character;
        state.stringEscape = false;
        return currentIndex + 1;
    }

    if (character === "/" && currentIndex + 1 < length) {
        const nextCharacter = text[currentIndex + 1];

        if (nextCharacter === "/") {
            state.inLineComment = true;
            return currentIndex + 2;
        }

        if (nextCharacter === "*") {
            state.inBlockComment = true;
            return currentIndex + 2;
        }
    }

    return currentIndex;
}

/**
 * Skips forward over whitespace and comments starting at the given index.
 * Returns the index of the first non-trivia character.
 */
function skipTrivia(text: string, startIndex: number): number {
    const length = text.length;
    let index = startIndex;

    while (index < length) {
        const character = text[index];

        if (isWhitespaceCharacter(character)) {
            index += 1;
            continue;
        }

        if (character === "/" && index + 1 < length) {
            const nextCharacter = text[index + 1];

            if (nextCharacter === "/") {
                index += 2;
                while (index < length && text[index] !== "\n") {
                    index += 1;
                }
                continue;
            }

            if (nextCharacter === "*") {
                index += 2;
                while (index < length) {
                    if (text[index] === "*" && index + 1 < length && text[index + 1] === "/") {
                        index += 2;
                        break;
                    }
                    index += 1;
                }
                continue;
            }
        }

        break;
    }

    return index;
}

/**
 * Skips backward over whitespace and comments before the given index.
 * Returns the index of the last non-trivia character, or -1 if none found.
 *
 * Note: This implementation handles line comments by checking if the current
 * position falls within a line comment (between // and newline) and skipping
 * back to before the // if so. This is necessary because when scanning backward,
 * we encounter comment content before we encounter the // marker.
 */
function skipTriviaBackward(text: string, startIndex: number): number {
    let current = startIndex;

    while (current >= 0) {
        const character = text[current];

        if (isWhitespaceCharacter(character)) {
            current -= 1;
            continue;
        }

        // Check if we're positioned at the end of a block comment (*/)
        if (character === "/" && current > 0 && text[current - 1] === "*") {
            current -= 2;
            // Scan backward to find the opening /*
            while (current >= 1) {
                if (text[current - 1] === "/" && text[current] === "*") {
                    current -= 2;
                    break;
                }
                current -= 1;
            }
            continue;
        }

        // Check if current position is within a line comment
        // Scan backward on the current line to see if there's a // before us
        let lineStart = current;
        let foundLineComment = false;
        while (lineStart >= 0 && text[lineStart] !== "\n") {
            if (lineStart > 0 && text[lineStart - 1] === "/" && text[lineStart] === "/") {
                // Found // before our position on this line, skip to before it
                current = lineStart - 2;
                foundLineComment = true;
                break;
            }
            lineStart -= 1;
        }

        // If we found and skipped a //, continue the outer loop
        if (foundLineComment) {
            continue;
        }

        // Not trivia, not in a comment, this is our result
        break;
    }

    return current;
}

/**
 * Detects and processes adjacent numeric literals separated only by trivia,
 * inserting a comma between them if necessary.
 */
function processAdjacentNumericLiterals(
    text: string,
    length: number,
    currentIndex: number,
    depth: number,
    ensureCopied: (uptoIndex: number) => void,
    parts: string[],
    adjustmentPositions: number[],
    insertedCount: { value: number }
): { nextIndex: number; modified: boolean } {
    if (depth !== 1 || !isNumericLiteralStart(text, currentIndex)) {
        return { nextIndex: currentIndex, modified: false };
    }

    const literal = readNumericLiteral(text, currentIndex);
    let nextIndex = literal.endIndex;

    const triviaStart = nextIndex;
    const trivia = readCallSeparatorTrivia(text, nextIndex);

    nextIndex = trivia.endIndex;

    if (trivia.hasContent && nextIndex < length && isNumericLiteralStart(text, nextIndex)) {
        ensureCopied(triviaStart);
        parts.push(",");
        adjustmentPositions.push(triviaStart + insertedCount.value);
        insertedCount.value += 1;
        return { nextIndex, modified: true };
    }

    return { nextIndex, modified: false };
}

/**
 * Walks source text to insert commas between numeric literal arguments when they are adjacent without separators.
 */
export function sanitizeMissingArgumentSeparators(sourceText: unknown): SanitizeMissingSeparatorsResult {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    const text = sourceText;
    const length = text.length;
    const adjustmentPositions: number[] = [];
    const parts: string[] = [];
    let index = 0;
    let copyIndex = 0;
    const insertedCount = { value: 0 };
    let modified = false;

    function ensureCopied(uptoIndex: number) {
        if (copyIndex >= uptoIndex) {
            return;
        }

        parts.push(text.slice(copyIndex, uptoIndex));
        copyIndex = uptoIndex;
        modified = true;
    }

    function processCall(startIndex: number, openParenIndex: number): CallProcessingResult {
        let currentIndex = openParenIndex + 1;
        const state = createCallProcessingState();
        let callModified = false;

        while (currentIndex < length && state.depth > 0) {
            const character = text[currentIndex];

            if (state.stringQuote !== null) {
                currentIndex = advanceThroughStringLiteral(text, currentIndex, state);
                continue;
            }

            if (state.inLineComment || state.inBlockComment) {
                currentIndex = advanceThroughComment(text, length, currentIndex, state);
                continue;
            }

            const stringOrCommentIndex = tryStartStringOrComment(text, length, currentIndex, state);
            if (stringOrCommentIndex !== currentIndex) {
                currentIndex = stringOrCommentIndex;
                continue;
            }

            if (character === "(") {
                state.depth += 1;
                currentIndex += 1;
                continue;
            }

            if (character === ")") {
                state.depth -= 1;
                currentIndex += 1;
                continue;
            }

            if (
                state.depth >= 1 &&
                isIdentifierBoundaryAt(text, currentIndex - 1) &&
                (isIdentifierStartCharacter(text[currentIndex]) || text[currentIndex] === "@")
            ) {
                const nestedMatch = matchFunctionCall(text, currentIndex);

                if (nestedMatch) {
                    const nestedResult = processCall(currentIndex, nestedMatch.openParenIndex);
                    currentIndex = nestedResult.index;
                    if (nestedResult.modified) {
                        callModified = true;
                    }
                    continue;
                }
            }

            const numericResult = processAdjacentNumericLiterals(
                text,
                length,
                currentIndex,
                state.depth,
                ensureCopied,
                parts,
                adjustmentPositions,
                insertedCount
            );

            if (numericResult.modified) {
                callModified = true;
                currentIndex = numericResult.nextIndex;
                continue;
            }

            if (numericResult.nextIndex !== currentIndex) {
                currentIndex = numericResult.nextIndex;
                continue;
            }

            currentIndex += 1;
        }

        if (callModified) {
            ensureCopied(currentIndex);
        }

        return { index: currentIndex, modified: callModified };
    }

    while (index < length) {
        const callMatch = matchFunctionCall(text, index);

        if (callMatch) {
            const result = processCall(index, callMatch.openParenIndex);
            index = result.index;
            continue;
        }

        index += 1;
    }

    if (!modified) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    ensureCopied(length);

    return {
        sourceText: parts.join(""),
        indexAdjustments: adjustmentPositions
    };
}

function matchFunctionCall(sourceText: string, startIndex: number): { openParenIndex: number } | null {
    if (!isIdentifierBoundaryAt(sourceText, startIndex - 1)) {
        return null;
    }

    const length = sourceText.length;
    let index = startIndex;

    if (!isIdentifierStartCharacter(sourceText[index])) {
        if (sourceText[index] !== "@") {
            return null;
        }

        index += 1;

        if (!isIdentifierStartCharacter(sourceText[index])) {
            return null;
        }
    }

    const precedingChar = readNonTriviaCharacterBefore(sourceText, startIndex);

    if (precedingChar === "." || precedingChar === "@") {
        return null;
    }

    let lastIdentifierStart = index;
    index += 1;

    while (index < length && isIdentifierCharacter(sourceText[index])) {
        index += 1;
    }

    let lastIdentifierEnd = index;

    while (index < length) {
        const character = sourceText[index];

        if (character === "." || character === "@") {
            index += 1;

            if (index >= length || !isIdentifierStartCharacter(sourceText[index])) {
                return null;
            }

            lastIdentifierStart = index;
            index += 1;

            while (index < length && isIdentifierCharacter(sourceText[index])) {
                index += 1;
            }

            lastIdentifierEnd = index;
            continue;
        }

        if (character === "[") {
            const bracketEnd = skipBalancedSection(sourceText, index, "[", "]");

            if (bracketEnd < 0) {
                return null;
            }

            index = bracketEnd;
            continue;
        }

        break;
    }

    const calleeIdentifier = sourceText.slice(lastIdentifierStart, lastIdentifierEnd);

    if (ensureForbiddenCalleeIdentifiers().has(calleeIdentifier)) {
        return null;
    }

    const precedingIdentifier = readIdentifierBefore(sourceText, startIndex);

    if (precedingIdentifier && FORBIDDEN_PRECEDING_IDENTIFIERS.has(precedingIdentifier)) {
        return null;
    }

    const openParenIndex = skipTrivia(sourceText, index);

    if (openParenIndex >= length || sourceText[openParenIndex] !== "(") {
        return null;
    }

    return { openParenIndex };
}

function skipBalancedSection(sourceText: string, startIndex: number, openChar: string, closeChar: string): number {
    const length = sourceText.length;
    let index = startIndex + 1;
    let depth = 1;
    // Note: The depth tracking for balanced sections is done via the local `depth` variable,
    // not via state.depth. The state object is only used for string/comment tracking.
    const state: CallProcessingState = {
        stringQuote: null,
        stringEscape: false,
        inLineComment: false,
        inBlockComment: false,
        depth: 0
    };

    while (index < length && depth > 0) {
        const character = sourceText[index];

        if (state.stringQuote !== null) {
            index = advanceThroughStringLiteral(sourceText, index, state);
            continue;
        }

        if (state.inLineComment || state.inBlockComment) {
            index = advanceThroughComment(sourceText, length, index, state);
            continue;
        }

        const stringOrCommentIndex = tryStartStringOrComment(sourceText, length, index, state);
        if (stringOrCommentIndex !== index) {
            index = stringOrCommentIndex;
            continue;
        }

        if (character === openChar) {
            depth += 1;
            index += 1;
            continue;
        }

        if (character === closeChar) {
            depth -= 1;
            index += 1;
            continue;
        }

        index += 1;
    }

    return depth === 0 ? index : -1;
}

function readIdentifierBefore(sourceText: string, index: number): string | null {
    const current = skipTriviaBackward(sourceText, index - 1);

    if (current < 0 || !isIdentifierCharacter(sourceText[current])) {
        return null;
    }

    const end = current + 1;
    let start = current;

    while (start >= 0 && isIdentifierCharacter(sourceText[start])) {
        start -= 1;
    }

    return sourceText.slice(start + 1, end);
}

function isIdentifierBoundaryAt(sourceText: string, index: number) {
    return Core.isIdentifierBoundaryCharacter(sourceText?.[index]);
}

function isIdentifierStartCharacter(character: string | undefined) {
    return /[A-Za-z_]/.test(character ?? "");
}

function isIdentifierCharacter(character: string | undefined) {
    return /[A-Za-z0-9_]/.test(character ?? "");
}

function isWhitespaceCharacter(character: string | undefined) {
    return character === " " || character === "\t" || character === "\n" || character === "\r";
}

function isNumericLiteralStart(text: string, index: number) {
    if (index >= text.length) {
        return false;
    }

    const character = text[index];
    if (character === "+" || character === "-") {
        return index + 1 < text.length && /[0-9.]/.test(text[index + 1]);
    }

    return /[0-9.]/.test(character);
}

function readNumericLiteral(text: string, startIndex: number) {
    let index = startIndex;
    const length = text.length;

    if (text[index] === "+" || text[index] === "-") {
        index += 1;
    }

    if (index + 1 < length && text[index] === "0" && (text[index + 1] === "x" || text[index + 1] === "X")) {
        index += 2;

        while (index < length && /[0-9a-fA-F]/.test(text[index])) {
            index += 1;
        }

        return {
            text: text.slice(startIndex, index),
            endIndex: index
        };
    }

    if (index + 1 < length && text[index] === "0" && (text[index + 1] === "b" || text[index + 1] === "B")) {
        index += 2;

        while (index < length && /[01]/.test(text[index])) {
            index += 1;
        }

        return {
            text: text.slice(startIndex, index),
            endIndex: index
        };
    }

    while (index < length && /[0-9]/.test(text[index])) {
        index += 1;
    }

    if (index < length && text[index] === ".") {
        index += 1;
        while (index < length && /[0-9]/.test(text[index])) {
            index += 1;
        }
    }

    if (index < length && (text[index] === "e" || text[index] === "E")) {
        index += 1;
        if (text[index] === "+" || text[index] === "-") {
            index += 1;
        }
        while (index < length && /[0-9]/.test(text[index])) {
            index += 1;
        }
    }

    return {
        text: text.slice(startIndex, index),
        endIndex: index
    };
}

function readCallSeparatorTrivia(text: string, startIndex: number) {
    const endIndex = skipTrivia(text, startIndex);
    return {
        endIndex,
        hasContent: endIndex > startIndex
    };
}

function readNonTriviaCharacterBefore(text: string, index: number) {
    const current = skipTriviaBackward(text, index - 1);
    return current >= 0 ? text[current] : null;
}
