/**
 * Shape of a GML parse error raised by the GameMaker Language parser.
 *
 * The concrete `GameMakerSyntaxError` class (in `@gml-modules/parser`) sets
 * `name = "GameMakerSyntaxError"` and optionally populates source-location
 * fields. Defining the shape here in Core decouples high-level consumers from
 * the concrete parser class while still giving them well-typed access to the
 * fields they care about.
 */
export interface GmlParseError extends Error {
    readonly name: "GameMakerSyntaxError";
    readonly line?: number;
    readonly column?: number;
    readonly wrongSymbol?: string;
    readonly offendingText?: string;
    readonly rule?: string;
}

/**
 * Determine whether a thrown value is a GML parse error emitted by the
 * GameMaker Language parser.
 *
 * The parser sets `error.name = "GameMakerSyntaxError"` on every parse
 * failure it raises. This guard relies on that stable name contract rather
 * than an `instanceof` check so that high-level consumers (e.g. the CLI
 * orchestration layer) do not need to import the concrete parser class and
 * can remain decoupled from the `@gml-modules/parser` workspace.
 *
 * @param {unknown} error Candidate value to inspect.
 * @returns {boolean} `true` when {@link error} is a GML parse error.
 */
export function isGmlParseError(error: unknown): error is GmlParseError {
    if (error == null || typeof error !== "object") {
        return false;
    }

    const candidate = error as { name?: unknown };
    return candidate.name === "GameMakerSyntaxError";
}

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
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Error & {
        line?: unknown;
        column?: unknown;
        rule?: unknown;
        wrongSymbol?: unknown;
        offendingText?: unknown;
    };

    if (typeof candidate.message !== "string") {
        return false;
    }

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
