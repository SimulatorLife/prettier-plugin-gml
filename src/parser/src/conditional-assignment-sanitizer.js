import {
    hasOwn,
    isNonEmptyArray,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isWordChar
} from "./shared/utils.js";
import { enqueueObjectChildValues } from "./shared/ast.js";

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

const identity = (value) => value;

/**
 * Create a function that remaps parser indices back to the original source
 * coordinates by subtracting how many guard characters were injected before a
 * given position.
 *
 * Invalid entries (non-numeric or duplicate offsets) are ignored so callers can
 * record adjustments opportunistically without sanitizing the array first.
 *
 * @param {Array<number> | null | undefined} insertPositions Raw indices where
 *     guard characters were inserted.
 * @returns {(index: number) => number} A lookup that translates parser indices
 *     to their original offsets.
 */
function createIndexMapper(insertPositions) {
    if (!isNonEmptyArray(insertPositions)) {
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

/**
 * Mutate an AST node's location metadata so it continues to point at the
 * correct source region after sanitization inserts additional characters.
 *
 * The parser may encode positions either as plain numbers or as objects with an
 * `index` field; both shapes are supported.
 *
 * @param {object} node AST node that may carry parser position metadata.
 * @param {string} propertyName Name of the property that should be remapped.
 * @param {(index: number) => number} mapIndex Function returned by
 *     {@link createIndexMapper} that translates parser indices.
 */
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
            enqueueObjectChildValues(stack, current);
            continue;
        }

        adjustLocationProperty(current, "start", mapIndex);
        adjustLocationProperty(current, "end", mapIndex);

        for (const value of Object.values(current)) {
            enqueueObjectChildValues(stack, value);
        }
    }
}
