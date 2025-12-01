import { Core } from "@gml-modules/core";

/**
 * Determine whether a thrown value exposes the location-rich fields emitted by
 * the ANTLR-generated parser. The guard accepts both native `SyntaxError`
 * instances and plain objects so long as they provide at least one numeric
 * coordinate (`line` or `column`). Optional metadata such as `rule`,
 * `wrongSymbol`, and `offendingText` must either be absent or string-valued to
 * ensure downstream formatters can surface the details without extra
 * normalization.
 *
 * @param {unknown} value Candidate error-like value to validate.
 * @returns {boolean} `true` when {@link value} resembles a parser syntax error
 *                    with location metadata.
 */
export function isSyntaxErrorWithLocation(value: unknown) {
    if (!Core.isErrorLike(value)) {
        return false;
    }

    const candidate = value as Error & {
        line?: unknown;
        column?: unknown;
        rule?: unknown;
        wrongSymbol?: unknown;
        offendingText?: unknown;
    };

    const hasFiniteLine = Number.isFinite(Number(candidate.line));
    const hasFiniteColumn = Number.isFinite(Number(candidate.column));

    if (!hasFiniteLine && !hasFiniteColumn) {
        return false;
    }

    const { rule, wrongSymbol, offendingText } = candidate;

    if (rule !== undefined && typeof rule !== "string") {
        return false;
    }

    if (wrongSymbol !== undefined && typeof wrongSymbol !== "string") {
        return false;
    }

    if (offendingText !== undefined && typeof offendingText !== "string") {
        return false;
    }

    return true;
}
