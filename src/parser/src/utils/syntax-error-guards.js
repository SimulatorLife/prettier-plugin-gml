import { isErrorLike } from "../../../shared/utils/capability-probes.js";

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
export function isSyntaxErrorWithLocation(value) {
    if (!isErrorLike(value)) {
        return false;
    }

    const hasFiniteLine = Number.isFinite(Number(value.line));
    const hasFiniteColumn = Number.isFinite(Number(value.column));

    if (!hasFiniteLine && !hasFiniteColumn) {
        return false;
    }

    const { rule, wrongSymbol, offendingText } = value;

    if (rule != undefined && typeof rule !== "string") {
        return false;
    }

    if (wrongSymbol != undefined && typeof wrongSymbol !== "string") {
        return false;
    }

    if (offendingText != undefined && typeof offendingText !== "string") {
        return false;
    }

    return true;
}
