import { Core } from "@gmloop/core";

/**
 * Source text scanning utilities for scientific-notation numeric literals.
 *
 * This module is consumed by two layers of the `@gmloop/lint` workspace:
 *
 *  1. **`language/recovery.ts`** (pre-parse, Phase A) — replaces every
 *     scientific-notation token with an equal-length placeholder so that the
 *     ANTLR parser does not choke on exponent syntax during malformed-source
 *     recovery.
 *
 *  2. **`rules/gml/rules/no-scientific-notation-rule.ts`** (AST phase) — walks
 *     the already-parsed source to report and auto-fix scientific-notation
 *     literals.
 *
 * Because this utility is needed by the `language/` layer (which runs *before*
 * rules), placing it here in `malformed/` — alongside `source-preprocessing.ts`
 * — keeps the dependency direction correct: the lower `language/` layer must
 * never import from the higher `rules/gml/` layer.  Moving the file here fixes
 * that architectural inversion.  (See target-state.md §2.1 and §3.1.)
 */

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
        Core.isIdentifierBoundaryCharacter(sourceText[startIndex - 1]) &&
        Core.isIdentifierBoundaryCharacter(sourceText[endIndex])
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
    const scanState = Core.createStringCommentScanState();
    const sourceLength = sourceText.length;

    let index = 0;
    while (index < sourceLength) {
        const scannedIndex = Core.advanceStringCommentScan(sourceText, sourceLength, index, scanState, true);
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
