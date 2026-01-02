/**
 * Fixes scenarios where writers assign a value directly inside a conditional expression (e.g., `if (x = 0)`).
 * The sanitizer inserts harmless guard operators so the parser and printer treat the expression as a comparison while
 * recording how indices shift so downstream diagnostics can stay in sync.
 */
import { Core } from "@gml-modules/core";

const ASSIGNMENT_GUARD_CHARACTERS = new Set([
    "*",
    "+",
    "-",
    "/",
    "%",
    "|",
    "&",
    "^",
    "<",
    ">",
    "!",
    "=",
    ":"
]);

/**
 * Returns a helper to translate character positions after insertions happen during sanitization.
 */
function createIndexMapper(
    insertPositions: Array<number | null | undefined> | null | undefined
) {
    const offsets = Core.isNonEmptyArray(insertPositions)
        ? [
              ...new Set(
                  insertPositions.filter(
                      (position): position is number =>
                          typeof position === "number" &&
                          Number.isFinite(position)
                  )
              )
          ].sort((a, b) => a - b)
        : [];

    if (offsets.length === 0) {
        return Core.identity;
    }

    return (index: unknown) => {
        if (typeof index !== "number") {
            return index;
        }

        const precedingInsertions = offsets.filter(
            (offset) => index > offset
        ).length;
        return index - precedingInsertions;
    };
}

function isQuoteCharacter(char: string) {
    return `"'\``.includes(char);
}

type ConditionalAssignmentScanState = {
    parts: string[];
    adjustmentPositions: number[];
    index: number;
    modified: boolean;
    inLineComment: boolean;
    inBlockComment: boolean;
    stringQuote: string | null;
    escapeNext: boolean;
    justSawIfKeyword: boolean;
    ifConditionDepth: number;
    insertionsSoFar: number;
};

function appendCharacter(state: ConditionalAssignmentScanState, character: string) {
    state.parts.push(character);
}

function handleLineComment(
    state: ConditionalAssignmentScanState,
    character: string
) {
    if (!state.inLineComment) {
        return false;
    }

    appendCharacter(state, character);
    if (character === "\n" || character === "\r") {
        state.inLineComment = false;
    }
    state.index += 1;
    return true;
}

function handleBlockComment(
    state: ConditionalAssignmentScanState,
    character: string,
    nextCharacter: string
) {
    if (!state.inBlockComment) {
        return false;
    }

    appendCharacter(state, character);
    if (character === "*" && nextCharacter === "/") {
        appendCharacter(state, nextCharacter);
        state.index += 2;
        state.inBlockComment = false;
        return true;
    }
    state.index += 1;
    return true;
}

function handleStringLiteral(
    state: ConditionalAssignmentScanState,
    character: string
) {
    if (!state.stringQuote) {
        return false;
    }

    appendCharacter(state, character);
    if (state.escapeNext) {
        state.escapeNext = false;
    } else if (character === "\\") {
        state.escapeNext = true;
    } else if (character === state.stringQuote) {
        state.stringQuote = null;
    }
    state.index += 1;
    return true;
}

function handleCommentStart(
    state: ConditionalAssignmentScanState,
    character: string,
    nextCharacter: string
) {
    if (character === "/" && nextCharacter === "/") {
        appendCharacter(state, character);
        appendCharacter(state, nextCharacter);
        state.index += 2;
        state.inLineComment = true;
        return true;
    }

    if (character === "/" && nextCharacter === "*") {
        appendCharacter(state, character);
        appendCharacter(state, nextCharacter);
        state.index += 2;
        state.inBlockComment = true;
        return true;
    }

    return false;
}

function handleQuoteStart(
    state: ConditionalAssignmentScanState,
    character: string
) {
    if (!isQuoteCharacter(character)) {
        return false;
    }

    state.stringQuote = character;
    appendCharacter(state, character);
    state.index += 1;
    return true;
}

function handleIfKeyword(
    state: ConditionalAssignmentScanState,
    character: string,
    nextCharacter: string,
    followingCharacter: string,
    prevCharacter: string
) {
    const lowerCharacter = character.toLowerCase();
    const lowerNextCharacter = nextCharacter.toLowerCase();

    if (
        lowerCharacter !== "i" ||
        lowerNextCharacter !== "f" ||
        Core.isWordChar(prevCharacter) ||
        Core.isWordChar(followingCharacter)
    ) {
        return false;
    }

    appendCharacter(state, character);
    appendCharacter(state, nextCharacter);
    state.index += 2;
    state.justSawIfKeyword = true;
    return true;
}

function handleIfConditionStart(
    state: ConditionalAssignmentScanState,
    character: string
) {
    if (!state.justSawIfKeyword) {
        return false;
    }

    if (!Core.isNonEmptyTrimmedString(character)) {
        appendCharacter(state, character);
        state.index += 1;
        return true;
    }

    if (character === "(") {
        appendCharacter(state, character);
        state.index += 1;
        state.ifConditionDepth = 1;
        state.justSawIfKeyword = false;
        return true;
    }

    state.justSawIfKeyword = false;
    return false;
}

function handleConditionalDepth(
    state: ConditionalAssignmentScanState,
    character: string
) {
    if (state.ifConditionDepth <= 0) {
        return false;
    }

    if (character === "(") {
        appendCharacter(state, character);
        state.index += 1;
        state.ifConditionDepth += 1;
        return true;
    }

    if (character === ")") {
        appendCharacter(state, character);
        state.index += 1;
        state.ifConditionDepth -= 1;
        return true;
    }

    return false;
}

function handleConditionalAssignment(
    state: ConditionalAssignmentScanState,
    character: string,
    nextCharacter: string,
    prevCharacter: string
) {
    if (state.ifConditionDepth <= 0 || character !== "=") {
        return false;
    }

    const shouldSkip =
        nextCharacter === "=" || ASSIGNMENT_GUARD_CHARACTERS.has(prevCharacter);

    if (shouldSkip) {
        return false;
    }

    appendCharacter(state, character);
    appendCharacter(state, "=");
    state.adjustmentPositions.push(state.index + state.insertionsSoFar + 1);
    state.insertionsSoFar += 1;
    state.modified = true;
    state.index += 1;
    return true;
}

function scanConditionalAssignments(text: string) {
    const state: ConditionalAssignmentScanState = {
        parts: [],
        adjustmentPositions: [],
        index: 0,
        modified: false,
        inLineComment: false,
        inBlockComment: false,
        stringQuote: null,
        escapeNext: false,
        justSawIfKeyword: false,
        ifConditionDepth: 0,
        insertionsSoFar: 0
    };

    const length = text.length;

    while (state.index < length) {
        const character = text[state.index];
        const nextCharacter =
            state.index + 1 < length ? text[state.index + 1] : "";
        const followingCharacter =
            state.index + 2 < length ? text[state.index + 2] : "";
        const prevCharacter = state.index > 0 ? text[state.index - 1] : "";

        if (handleLineComment(state, character)) {
            continue;
        }

        if (handleBlockComment(state, character, nextCharacter)) {
            continue;
        }

        if (handleStringLiteral(state, character)) {
            continue;
        }

        if (handleCommentStart(state, character, nextCharacter)) {
            continue;
        }

        if (handleQuoteStart(state, character)) {
            continue;
        }

        if (
            handleIfKeyword(
                state,
                character,
                nextCharacter,
                followingCharacter,
                prevCharacter
            )
        ) {
            continue;
        }

        if (handleIfConditionStart(state, character)) {
            continue;
        }

        if (handleConditionalDepth(state, character)) {
            continue;
        }

        if (
            handleConditionalAssignment(
                state,
                character,
                nextCharacter,
                prevCharacter
            )
        ) {
            continue;
        }

        appendCharacter(state, character);
        state.index += 1;
    }

    return {
        modified: state.modified,
        sourceText: state.parts.join(""),
        adjustmentPositions: state.adjustmentPositions
    };
}

/**
 * Scans source text for inline assignments within conditions, adds guard characters, and reports index shifts.
 */
export function sanitizeConditionalAssignments(sourceText: unknown) {
    if (!Core.isNonEmptyString(sourceText)) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    const scanResult = scanConditionalAssignments(sourceText);

    if (!scanResult.modified) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    return {
        sourceText: scanResult.sourceText,
        indexAdjustments: scanResult.adjustmentPositions
    };
}

/**
 * Rewrites location metadata for nodes to account for the inserted guard characters.
 */
export function applySanitizedIndexAdjustments(
    target: unknown,
    insertPositions: Array<number> | null | undefined
) {
    const mapIndex = createIndexMapper(insertPositions);
    Core.remapLocationMetadata(target, mapIndex);
}

export const conditionalAssignmentSanitizerTransform = Object.freeze({
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
});

export default {
    conditionalAssignmentSanitizerTransform,
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
};
