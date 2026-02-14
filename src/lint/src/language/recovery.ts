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
    return /[A-Za-z0-9_"']/u.test(character);
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

function isLikelyCallArgumentGap(sourceText: string, leftIndex: number): boolean {
    let cursor = leftIndex;
    while (cursor >= 0) {
        const character = sourceText[cursor] ?? "";
        if (character === "(") {
            return true;
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

    for (let index = 0; index < sourceText.length; index += 1) {
        const character = sourceText[index] ?? "";
        if (!/\s/u.test(character)) {
            continue;
        }

        const previousIndex = findPreviousNonWhitespaceIndex(sourceText, index - 1);
        const nextIndex = findNextNonWhitespaceIndex(sourceText, index + 1);
        if (previousIndex === -1 || nextIndex === -1) {
            continue;
        }

        if (
            !isIdentifierCharacter(sourceText[previousIndex] ?? "") ||
            !isIdentifierCharacter(sourceText[nextIndex] ?? "") ||
            !isLikelyCallArgumentGap(sourceText, previousIndex)
        ) {
            continue;
        }

        chunks.push(sourceText.slice(copiedThrough, index), ",");
        copiedThrough = index;

        const recoveredOffset = index + insertions.length;
        insertions.push({
            kind: INSERTED_ARGUMENT_SEPARATOR_KIND,
            recoveredOffset,
            originalOffset: index,
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
