const WORD_CHAR_PATTERN = /[A-Za-z0-9_]/;

function isWordChar(character) {
    if (typeof character !== "string" || character.length === 0) {
        return false;
    }

    return WORD_CHAR_PATTERN.test(character);
}

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

function pushChar(resultParts, character) {
    resultParts.push(character);
    return 1;
}

function isQuoteCharacter(character) {
    return character === '"' || character === "'" || character === "`";
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
    let sanitizedIndex = 0;
    let modified = false;
    let inLineComment = false;
    let inBlockComment = false;
    let stringQuote = null;
    let escapeNext = false;
    let justSawIfKeyword = false;
    let ifConditionDepth = 0;

    const append = (character) => {
        sanitizedIndex += pushChar(parts, character);
    };

    const assignmentGuardCharacters = new Set([
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
            if (character.trim().length === 0) {
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
                    assignmentGuardCharacters.has(prevCharacter);

                if (!shouldSkip) {
                    append("=");
                    append("=");
                    adjustmentPositions.push(sanitizedIndex - 1);
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

        if (!current || typeof current !== "object") {
            continue;
        }

        if (seen.has(current)) {
            continue;
        }

        seen.add(current);

        if (Array.isArray(current)) {
            for (const item of current) {
                stack.push(item);
            }
            continue;
        }

        if (Object.prototype.hasOwnProperty.call(current, "start")) {
            const start = current.start;

            if (typeof start === "number") {
                current.start = mapIndex(start);
            } else if (start && typeof start === "object") {
                if (typeof start.index === "number") {
                    start.index = mapIndex(start.index);
                }
            }
        }

        if (Object.prototype.hasOwnProperty.call(current, "end")) {
            const end = current.end;

            if (typeof end === "number") {
                current.end = mapIndex(end);
            } else if (end && typeof end === "object") {
                if (typeof end.index === "number") {
                    end.index = mapIndex(end.index);
                }
            }
        }

        for (const value of Object.values(current)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            stack.push(value);
        }
    }
}
