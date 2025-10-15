import { hasOwn } from "../../shared/object-utils.js";
import {
    isNonEmptyTrimmedString,
    isWordChar
} from "../../shared/string-utils.js";

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
    if (!Array.isArray(insertPositions) || insertPositions.length === 0) {
        return (index) => index;
    }

    const sortedPositions = [...insertPositions].sort((a, b) => a - b);

    return (index) => {
        if (typeof index !== "number") {
            return index;
        }

        let low = 0;
        let high = sortedPositions.length;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (index > sortedPositions[mid]) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return index - low;
    };
}

function isQuoteCharacter(character) {
    return character === '"' || character === "'" || character === "`";
}

function adjustLocationProperty(node, propertyName, mapIndex) {
    if (!hasOwn(node, propertyName)) {
        return;
    }

    const location = node[propertyName];

    if (typeof location === "number") {
        node[propertyName] = mapIndex(location);
        return;
    }

    if (
        !location ||
        typeof location !== "object" ||
        typeof location.index !== "number"
    ) {
        return;
    }

    location.index = mapIndex(location.index);
}

export function sanitizeConditionalAssignments(sourceText) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
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
            (character === "i" || character === "I") &&
            (nextCharacter === "f" || nextCharacter === "F")
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
                    append("=");
                    append("=");
                    adjustmentPositions.push(parts.length - 1);
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
    if (!target || typeof target !== "object") {
        return;
    }

    const mapIndex = createIndexMapper(insertPositions);
    const stack = [target];
    const seen = new WeakSet();

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== "object" || seen.has(current)) {
            continue;
        }

        seen.add(current);

        if (Array.isArray(current)) {
            for (const item of current) {
                stack.push(item);
            }
            continue;
        }

        adjustLocationProperty(current, "start", mapIndex);
        adjustLocationProperty(current, "end", mapIndex);

        for (const value of Object.values(current)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            stack.push(value);
        }
    }
}
