export type RecoveryMode = "none" | "limited";

export const INSERTED_ARGUMENT_SEPARATOR_KIND = "inserted-argument-separator" as const;

export type InsertedArgumentSeparatorRecovery = {
    kind: typeof INSERTED_ARGUMENT_SEPARATOR_KIND;
    recoveredOffset: number;
    originalOffset: number;
    insertedText: ",";
};

export type RecoveryProjection = {
    parseSource: string;
    insertions: ReadonlyArray<InsertedArgumentSeparatorRecovery>;
};

function isIdentifierCharacter(character: string): boolean {
    return /[A-Za-z0-9_]/u.test(character);
}

function canTerminateArgumentExpression(character: string): boolean {
    return (
        isIdentifierCharacter(character) ||
        character === '"' ||
        character === "'" ||
        character === ")" ||
        character === "]" ||
        character === "}"
    );
}

function canStartArgumentExpression(character: string): boolean {
    return (
        isIdentifierCharacter(character) ||
        character === '"' ||
        character === "'" ||
        character === "(" ||
        character === "[" ||
        character === "{"
    );
}

function isArgumentBoundaryCharacter(character: string): boolean {
    return character === ")" || character === "]" || character === "}" || character === ",";
}

function findPreviousNonWhitespaceIndex(sourceText: string, fromIndex: number): number {
    for (let cursor = fromIndex; cursor >= 0; cursor -= 1) {
        if (!/\s/u.test(sourceText[cursor] ?? "")) {
            return cursor;
        }
    }

    return -1;
}

function findNextNonWhitespaceIndex(sourceText: string, fromIndex: number): number {
    for (let cursor = fromIndex; cursor < sourceText.length; cursor += 1) {
        if (!/\s/u.test(sourceText[cursor] ?? "")) {
            return cursor;
        }
    }

    return -1;
}

function maskCommentsAndStringsForRecovery(sourceText: string): string {
    const chars = sourceText.split("");
    let index = 0;

    while (index < sourceText.length) {
        const character = sourceText[index] ?? "";
        const nextCharacter = sourceText[index + 1] ?? "";

        if (character === "/" && nextCharacter === "/") {
            chars[index] = " ";
            chars[index + 1] = " ";
            index += 2;
            while (index < sourceText.length) {
                const lineCharacter = sourceText[index] ?? "";
                if (lineCharacter === "\n" || lineCharacter === "\r") {
                    break;
                }
                chars[index] = " ";
                index += 1;
            }
            continue;
        }

        if (character === "/" && nextCharacter === "*") {
            chars[index] = " ";
            chars[index + 1] = " ";
            index += 2;
            while (index < sourceText.length) {
                const blockCharacter = sourceText[index] ?? "";
                const blockNext = sourceText[index + 1] ?? "";
                if (blockCharacter === "*" && blockNext === "/") {
                    chars[index] = " ";
                    chars[index + 1] = " ";
                    index += 2;
                    break;
                }

                if (blockCharacter !== "\n" && blockCharacter !== "\r") {
                    chars[index] = " ";
                }
                index += 1;
            }
            continue;
        }

        if (character === '"' || character === "'") {
            const quoteCharacter = character;
            chars[index] = quoteCharacter;
            index += 1;
            while (index < sourceText.length) {
                const stringCharacter = sourceText[index] ?? "";
                if (stringCharacter === "\\") {
                    chars[index] = "_";
                    if (index + 1 < sourceText.length) {
                        chars[index + 1] = "_";
                    }
                    index += 2;
                    continue;
                }

                if (stringCharacter === quoteCharacter) {
                    chars[index] = quoteCharacter;
                    index += 1;
                    break;
                }

                if (stringCharacter !== "\n" && stringCharacter !== "\r") {
                    chars[index] = "_";
                }
                index += 1;
            }
            continue;
        }

        index += 1;
    }

    return chars.join("");
}

type IdentifierToken = Readonly<{
    value: string;
    start: number;
}>;

function readIdentifierTokenEndingAt(sourceText: string, endIndex: number): IdentifierToken | null {
    const character = sourceText[endIndex] ?? "";
    if (!isIdentifierCharacter(character)) {
        return null;
    }

    let startIndex = endIndex;
    while (startIndex > 0 && isIdentifierCharacter(sourceText[startIndex - 1] ?? "")) {
        startIndex -= 1;
    }

    return Object.freeze({
        value: sourceText.slice(startIndex, endIndex + 1),
        start: startIndex
    });
}

const NON_CALL_PREFIX_KEYWORDS = new Set([
    "if",
    "for",
    "while",
    "switch",
    "repeat",
    "with",
    "function",
    "constructor",
    "catch"
]);

function isLikelyCallArgumentGap(sourceText: string, leftIndex: number): boolean {
    let cursor = leftIndex;
    while (cursor >= 0) {
        const character = sourceText[cursor] ?? "";
        if (character === "(") {
            const calleeEndIndex = findPreviousNonWhitespaceIndex(sourceText, cursor - 1);
            if (calleeEndIndex === -1) {
                return false;
            }

            const calleeToken = readIdentifierTokenEndingAt(sourceText, calleeEndIndex);
            if (calleeToken) {
                if (NON_CALL_PREFIX_KEYWORDS.has(calleeToken.value.toLowerCase())) {
                    return false;
                }

                const beforeCalleeIndex = findPreviousNonWhitespaceIndex(sourceText, calleeToken.start - 1);
                if (beforeCalleeIndex === -1) {
                    return true;
                }

                const prefixToken = readIdentifierTokenEndingAt(sourceText, beforeCalleeIndex);
                return prefixToken?.value.toLowerCase() !== "function";
            }

            const calleeCharacter = sourceText[calleeEndIndex] ?? "";
            return calleeCharacter === ")" || calleeCharacter === "]";
        }

        if (isArgumentBoundaryCharacter(character) || character === "\n" || character === "\r" || character === ";") {
            return false;
        }

        cursor -= 1;
    }

    return false;
}

/**
 * Produces a parser-recovery source variant by inserting commas in clearly ambiguous
 * call argument positions where users omitted separators.
 */
export function createLimitedRecoveryProjection(sourceText: string): RecoveryProjection {
    if (sourceText.length === 0) {
        return Object.freeze({ parseSource: sourceText, insertions: Object.freeze([]) });
    }

    const chunks: Array<string> = [];
    const insertions: Array<InsertedArgumentSeparatorRecovery> = [];
    let copiedThrough = 0;

    const recoveryScanSource = maskCommentsAndStringsForRecovery(sourceText);
    let index = 0;
    while (index < sourceText.length) {
        const character = recoveryScanSource[index] ?? "";
        if (!/\s/u.test(character)) {
            index += 1;
            continue;
        }

        const whitespaceRunStart = index;
        while (index < sourceText.length && /\s/u.test(recoveryScanSource[index] ?? "")) {
            index += 1;
        }
        const whitespaceRunEnd = index - 1;

        const previousIndex = findPreviousNonWhitespaceIndex(recoveryScanSource, whitespaceRunStart - 1);
        const nextIndex = findNextNonWhitespaceIndex(recoveryScanSource, whitespaceRunEnd + 1);
        if (previousIndex === -1 || nextIndex === -1) {
            continue;
        }

        if (
            !canTerminateArgumentExpression(recoveryScanSource[previousIndex] ?? "") ||
            !canStartArgumentExpression(recoveryScanSource[nextIndex] ?? "") ||
            !isLikelyCallArgumentGap(recoveryScanSource, previousIndex)
        ) {
            continue;
        }

        chunks.push(sourceText.slice(copiedThrough, whitespaceRunStart), ",");
        copiedThrough = whitespaceRunStart;

        const recoveredOffset = whitespaceRunStart + insertions.length;
        insertions.push({
            kind: INSERTED_ARGUMENT_SEPARATOR_KIND,
            recoveredOffset,
            originalOffset: whitespaceRunStart,
            insertedText: ","
        });
    }

    if (insertions.length === 0) {
        return Object.freeze({ parseSource: sourceText, insertions: Object.freeze([]) });
    }

    chunks.push(sourceText.slice(copiedThrough));

    return Object.freeze({
        parseSource: chunks.join(""),
        insertions: Object.freeze(insertions.map((entry) => Object.freeze({ ...entry })))
    });
}

export function mapRecoveredIndexToOriginal(
    recoveredIndex: number,
    insertions: ReadonlyArray<InsertedArgumentSeparatorRecovery>
): number {
    if (!Number.isFinite(recoveredIndex) || insertions.length === 0) {
        return recoveredIndex;
    }

    let shift = 0;
    for (const insertion of insertions) {
        if (insertion.recoveredOffset >= recoveredIndex) {
            break;
        }

        shift += insertion.insertedText.length;
    }

    return Math.max(0, recoveredIndex - shift);
}
