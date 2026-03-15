import * as CoreWorkspace from "@gmloop/core";

/**
 * Matches scientific-notation numeric literals (sticky, must be reset via `lastIndex`).
 * Pattern: optional-integer optional-fraction exponent  e.g. `1e5`, `1.5e-3`, `.25E+2`
 */
export const SCIENTIFIC_NOTATION_PATTERN = /(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+/y;

/**
 * Returns `true` when the characters immediately surrounding the matched span are not
 * part of a GML identifier, ensuring we never match inside a larger word.
 */
export function isScientificNotationBoundary(sourceText: string, startIndex: number, endIndex: number): boolean {
    return (
        CoreWorkspace.Core.isIdentifierBoundaryCharacter(sourceText[startIndex - 1]) &&
        CoreWorkspace.Core.isIdentifierBoundaryCharacter(sourceText[endIndex])
    );
}

/**
 * Iterates over every scientific-notation token in `sourceText` that is outside
 * string literals and line comments, calling `onMatch` for each occurrence.
 *
 * The callback receives the `start` index (inclusive), `end` index (exclusive),
 * and the matched token text.
 */
export function forEachScientificNotationToken(
    sourceText: string,
    onMatch: (start: number, end: number, text: string) => void
): void {
    const scanState = CoreWorkspace.Core.createStringCommentScanState();
    const sourceLength = sourceText.length;

    let index = 0;
    while (index < sourceLength) {
        const scannedIndex = CoreWorkspace.Core.advanceStringCommentScan(
            sourceText,
            sourceLength,
            index,
            scanState,
            true
        );
        if (scannedIndex !== index) {
            index = scannedIndex;
            continue;
        }

        SCIENTIFIC_NOTATION_PATTERN.lastIndex = index;
        const match = SCIENTIFIC_NOTATION_PATTERN.exec(sourceText);
        if (!match) {
            index += 1;
            continue;
        }

        const scientificText = match[0] ?? "";
        const start = index;
        const end = start + scientificText.length;
        if (!isScientificNotationBoundary(sourceText, start, end)) {
            index += 1;
            continue;
        }

        onMatch(start, end, scientificText);
        index = end;
    }
}
