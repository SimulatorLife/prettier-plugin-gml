import { Core } from "@gml-modules/core";
import { remapLocationMetadata } from "../ast/location-manipulation.js";

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

function createIndexMapper(
    insertPositions: Array<number | null | undefined> | null | undefined
) {
    if (!Core.isNonEmptyArray(insertPositions)) {
        return Core.identity;
    }

    const numericPositions = insertPositions.filter(
        (position): position is number =>
            typeof position === "number" && Number.isFinite(position)
    );
    const offsets = Array.from(new Set(numericPositions)).sort((a, b) => a - b);

    if (offsets.length === 0) {
        return Core.identity;
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

function isQuoteCharacter(char: string) {
    return `"'\``.includes(char);
}

export function sanitizeConditionalAssignments(sourceText: unknown) {
    if (!Core.isNonEmptyString(sourceText)) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    const parts: string[] = [];
    const adjustmentPositions: Array<number> = [];
    const text = sourceText as string;
    const length = text.length;
    let index = 0;
    let modified = false;
    let inLineComment = false;
    let inBlockComment = false;
    let stringQuote: string | null = null;
    let escapeNext = false;
    let justSawIfKeyword = false;
    let ifConditionDepth = 0;
    let insertionsSoFar = 0;

    const append = (character: string) => {
        parts.push(character);
    };

    while (index < length) {
        const character = text[index];
        const nextCharacter = index + 1 < length ? text[index + 1] : "";
        const followingCharacter = index + 2 < length ? text[index + 2] : "";
        const prevCharacter = index > 0 ? text[index - 1] : "";

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

        const lowerCharacter = character.toLowerCase();
        const lowerNextCharacter = nextCharacter.toLowerCase();

        if (
            lowerCharacter === "i" &&
            lowerNextCharacter === "f" &&
            !Core.isWordChar(prevCharacter) &&
            !Core.isWordChar(followingCharacter)
        ) {
            append(character);
            append(nextCharacter);
            index += 2;
            justSawIfKeyword = true;
            continue;
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

            if (character === "=") {
                const shouldSkip =
                    nextCharacter === "=" ||
                    ASSIGNMENT_GUARD_CHARACTERS.has(prevCharacter);

                if (!shouldSkip) {
                    append(character);
                    append("=");
                    adjustmentPositions.push(index + insertionsSoFar + 1);
                    insertionsSoFar += 1;
                    modified = true;
                    index += 1;
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

export function applySanitizedIndexAdjustments(
    target: unknown,
    insertPositions: Array<number> | null | undefined
) {
    const mapIndex = createIndexMapper(insertPositions);
    remapLocationMetadata(target, mapIndex);
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
