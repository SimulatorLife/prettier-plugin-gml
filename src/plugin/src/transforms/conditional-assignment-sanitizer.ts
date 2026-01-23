/**
 * Fixes scenarios where writers assign a value directly inside a conditional expression (e.g., `if (x = 0)`).
 * The sanitizer inserts harmless guard operators so the parser and printer treat the expression as a comparison while
 * recording how indices shift so downstream diagnostics can stay in sync.
 */
import { Core } from "@gml-modules/core";

import {
    advanceThroughComment,
    advanceThroughStringLiteral,
    createStringCommentScanState,
    type StringCommentScanState,
    tryStartStringOrComment
} from "./source-text/string-comment-scan.js";

const ASSIGNMENT_GUARD_CHARACTERS = new Set(["*", "+", "-", "/", "%", "|", "&", "^", "<", ">", "!", "=", ":"]);

/**
 * Returns a helper to translate character positions after insertions happen during sanitization.
 */
function createIndexMapper(
    insertPositions: Array<number | null | undefined> | null | undefined
): (index: number) => number {
    const offsets = Core.isNonEmptyArray(insertPositions)
        ? [
              ...new Set(
                  insertPositions.filter(
                      (position): position is number => typeof position === "number" && Number.isFinite(position)
                  )
              )
          ].toSorted((a, b) => a - b)
        : [];

    if (offsets.length === 0) {
        return (index) => index;
    }

    return (index: number) => {
        const precedingInsertions = offsets.filter((offset) => index > offset).length;
        return index - precedingInsertions;
    };
}

type ConditionalAssignmentScanState = StringCommentScanState & {
    parts: string[];
    adjustmentPositions: number[];
    index: number;
    modified: boolean;
    justSawIfKeyword: boolean;
    ifConditionDepth: number;
    insertionsSoFar: number;
};

function appendCharacter(state: ConditionalAssignmentScanState, character: string) {
    state.parts.push(character);
}

function advanceThroughStringOrComment(state: ConditionalAssignmentScanState, text: string, length: number) {
    if (state.inLineComment || state.inBlockComment) {
        const nextIndex = advanceThroughComment(text, length, state.index, state);
        appendCharacter(state, text.slice(state.index, nextIndex));
        state.index = nextIndex;
        return true;
    }

    if (state.stringQuote) {
        const nextIndex = advanceThroughStringLiteral(text, state.index, state);
        appendCharacter(state, text.slice(state.index, nextIndex));
        state.index = nextIndex;
        return true;
    }

    const stringOrCommentIndex = tryStartStringOrComment(text, length, state.index, state);
    if (stringOrCommentIndex !== state.index) {
        appendCharacter(state, text.slice(state.index, stringOrCommentIndex));
        state.index = stringOrCommentIndex;
        return true;
    }

    return false;
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

function handleIfConditionStart(state: ConditionalAssignmentScanState, character: string) {
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

function handleConditionalDepth(state: ConditionalAssignmentScanState, character: string) {
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

    const shouldSkip = nextCharacter === "=" || ASSIGNMENT_GUARD_CHARACTERS.has(prevCharacter);

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
        ...createStringCommentScanState(),
        justSawIfKeyword: false,
        ifConditionDepth: 0,
        insertionsSoFar: 0
    };

    const length = text.length;

    while (state.index < length) {
        const character = text[state.index];
        if (advanceThroughStringOrComment(state, text, length)) {
            continue;
        }

        const nextCharacter = state.index + 1 < length ? text[state.index + 1] : "";
        const followingCharacter = state.index + 2 < length ? text[state.index + 2] : "";
        const prevCharacter = state.index > 0 ? text[state.index - 1] : "";

        if (handleIfKeyword(state, character, nextCharacter, followingCharacter, prevCharacter)) {
            continue;
        }

        if (handleIfConditionStart(state, character)) {
            continue;
        }

        if (handleConditionalDepth(state, character)) {
            continue;
        }

        if (handleConditionalAssignment(state, character, nextCharacter, prevCharacter)) {
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
export function applySanitizedIndexAdjustments(target: unknown, insertPositions: Array<number> | null | undefined) {
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
