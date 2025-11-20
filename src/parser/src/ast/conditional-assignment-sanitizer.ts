import { Core } from "@gml-modules/core";
import { remapLocationMetadata } from "../location-manipulation.js";

const {
    Utils: {
        isNonEmptyArray,
        isNonEmptyString,
        isNonEmptyTrimmedString,
        isWordChar,
        identity
    }
} = Core;

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
 * Create a function that remaps parser indices back to the original source
 * coordinates by subtracting how many guard characters were injected before a
 * given position.
 *
 * Invalid entries (non-numeric or duplicate offsets) are ignored so callers can
 * record adjustments opportunistically without sanitizing the array first.
 *
 * @param {Array<number | null | undefined> | null | undefined} insertPositions Raw indices where
 *     guard characters were inserted.
 * @returns {(index: number) => number} A lookup that translates parser indices
 *     to their original offsets.
 */
function createIndexMapper(
    insertPositions: Array<number | null | undefined> | null | undefined
) {
    if (!isNonEmptyArray(insertPositions)) {
        return identity;
    }

    const numericPositions = insertPositions.filter(
        (position): position is number =>
            typeof position === "number" && Number.isFinite(position)
    );
    const offsets = Array.from(new Set(numericPositions)).sort(
        (a, b) => a - b
    );

    if (offsets.length === 0) {
        return identity;
    }

    return (index) => {
        if (typeof index !== "number") {
            return index;
        }

        let left = 0;
        let right = offsets.length;

        while (left < right) {
            const middle = (left + right) >> 1;
            const currentOffset = offsets[middle] ?? Number.NEGATIVE_INFINITY;
            if (index <= currentOffset) {
                right = middle;
            } else {
                left = middle + 1;
            }
        }

        return index - left;
    };
}

function isQuoteCharacter(char) {
    return `"'\``.includes(char);
}

/**
 * Walk a source string and defensively expand bare assignment operators inside
 * `if` conditions into equality checks. The underlying GameMaker parser treats
 * `if (a = b)` as a syntax error rather than an assignment expression, so the
 * sanitizer rewrites it to `if (a == b)` before parsing. When characters are
 * inserted, their indices are recorded so downstream consumers can translate
 * AST location metadata back to the original source.
 *
 * @param {unknown} sourceText Raw text that will be handed to the parser.
 * @returns {{ sourceText: unknown, indexAdjustments: Array<number> | null }}
 *     Potentially rewritten source text along with the insertion points needed
 *     to map parser indices to the original string.
 */
export function sanitizeConditionalAssignments(sourceText) {
    if (!isNonEmptyString(sourceText)) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    const parts = [];
    const adjustmentPositions = [];
    const length = sourceText.length;
    let index = 0;
    let modified = false;
    let inLineComment = false;
    let inBlockComment = false;
    let stringQuote = null;
    let escapeNext = false;
    let justSawIfKeyword = false;
    let ifConditionDepth = 0;
    let insertionsSoFar = 0;

    const append = (character) => {
        parts.push(character);
    };

    while (index < length) {
        const character = sourceText[index];
        const nextCharacter = index + 1 < length ? sourceText[index + 1] : "";

        if (inLineComment) {
            append(character);
            if (character === "\n" || character === "\r") {
                inLineComment = false;
            }
            index += 1;
            continue;
        }

        if (inBlockComment) {
            append(character);
            if (character === "*" && nextCharacter === "/") {
                append(nextCharacter);
                index += 2;
                inBlockComment = false;
                continue;
            }
            index += 1;
            continue;
        }

        if (stringQuote) {
            append(character);
            if (escapeNext) {
                escapeNext = false;
            } else if (character === "\\") {
                escapeNext = true;
            } else if (character === stringQuote) {
                stringQuote = null;
            }
            index += 1;
            continue;
        }

        if (character === "/" && nextCharacter === "/") {
            append(character);
            append(nextCharacter);
            index += 2;
            inLineComment = true;
            continue;
        }

        if (character === "/" && nextCharacter === "*") {
            append(character);
            append(nextCharacter);
            index += 2;
            inBlockComment = true;
            continue;
        }

        if (isQuoteCharacter(character)) {
            stringQuote = character;
            append(character);
            index += 1;
            continue;
        }

        if (
            character.toLowerCase() === "i" &&
            nextCharacter.toLowerCase() === "f"
        ) {
            const prevCharacter = index > 0 ? sourceText[index - 1] : "";
            const followingCharacter =
                index + 2 < length ? sourceText[index + 2] : "";

            if (!isWordChar(prevCharacter) && !isWordChar(followingCharacter)) {
                append(character);
                append(nextCharacter);
                index += 2;
                justSawIfKeyword = true;
                continue;
            }
        }

        if (justSawIfKeyword) {
            if (!isNonEmptyTrimmedString(character)) {
                append(character);
                index += 1;
                continue;
            }

            if (character === "(") {
                append(character);
                index += 1;
                ifConditionDepth = 1;
                justSawIfKeyword = false;
                continue;
            }

            justSawIfKeyword = false;
        }

        if (ifConditionDepth > 0) {
            if (character === "(") {
                append(character);
                index += 1;
                ifConditionDepth += 1;
                continue;
            }

            if (character === ")") {
                append(character);
                index += 1;
                ifConditionDepth -= 1;
                continue;
            }

            if (character === "/" && nextCharacter === "/") {
                append(character);
                append(nextCharacter);
                index += 2;
                inLineComment = true;
                continue;
            }

            if (character === "/" && nextCharacter === "*") {
                append(character);
                append(nextCharacter);
                index += 2;
                inBlockComment = true;
                continue;
            }

            if (isQuoteCharacter(character)) {
                stringQuote = character;
                append(character);
                index += 1;
                continue;
            }

            if (character === "=") {
                const prevCharacter = index > 0 ? sourceText[index - 1] : "";
                const shouldSkip =
                    nextCharacter === "=" ||
                    ASSIGNMENT_GUARD_CHARACTERS.has(prevCharacter);

                if (!shouldSkip) {
                    append(character); // original '='
                    append("="); // extra '=' to make '=='
                    adjustmentPositions.push(index + insertionsSoFar + 1); // record position of new character in modified string
                    insertionsSoFar += 1;
                    index += 1;
                    modified = true;
                    continue;
                }
            }
        }

        append(character);
        index += 1;
    }

    if (!modified) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    return {
        sourceText: parts.join(""),
        indexAdjustments: adjustmentPositions
    };
}

/**
 * Apply the recorded index adjustments from {@link sanitizeConditionalAssignments}
 * to a parsed AST (or any nested object containing `start` / `end` metadata).
 * The mapper walks every object and array it encounters, updating numeric
 * indices as well as `{ index: number }` records so location information once
 * again matches the caller's pre-sanitized source text.
 *
 * @param {unknown} target AST node or metadata object with location fields.
 * @param {Array<number> | null | undefined} insertPositions Collected
 *     insertion offsets returned by {@link sanitizeConditionalAssignments}.
 * @returns {void}
 */
export function applySanitizedIndexAdjustments(target, insertPositions) {
    const mapIndex = createIndexMapper(insertPositions);
    remapLocationMetadata(target, mapIndex);
}
