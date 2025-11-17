import { remapLocationMetadata } from "./location-manipulation.js";
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

function createIndexMapper(insertPositions) {
    if (!Core.isNonEmptyArray(insertPositions)) {
        return identity;
    }

    const offsets = Array.from(
        new Set(insertPositions.filter((position) => Number.isFinite(position)))
    ).sort((a, b) => a - b);

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
            if (index <= offsets[middle]) {
                right = middle;
            } else {
                left = middle + 1;
            }
        }

        return index - left;
    };
}

function isQuoteCharacter(character) {
    return character === '"' || character === "'" || character === "`";
}

export function sanitizeConditionalAssignments(sourceText) {
    if (!Core.isNonEmptyString(sourceText)) {
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

            if (
                !Core.isWordChar(prevCharacter) &&
                !Core.isWordChar(followingCharacter)
            ) {
                append(character);
                append(nextCharacter);
                index += 2;
                justSawIfKeyword = true;
                continue;
            }
        }

        if (justSawIfKeyword) {
            if (!Core.isNonEmptyTrimmedString(character)) {
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
                    append(character);
                    append("=");
                    adjustmentPositions.push(index + insertionsSoFar + 1);
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

export function applySanitizedIndexAdjustments(target, insertPositions) {
    const mapIndex = createIndexMapper(insertPositions);
    remapLocationMetadata(target, mapIndex);
}
