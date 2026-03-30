const STATEMENT_TERMINATION_KEYWORDS = Object.freeze(["if", "for", "while", "switch", "try", "with", "do"]);

/**
 * Return true when the emitted code fragment already ends with a statement
 * terminator and therefore does not need a trailing semicolon.
 *
 * This predicate is kept separate from the emitter's string concatenation so
 * that the heuristics are testable in isolation and do not couple formatting
 * rules to the mechanics that mutate the output buffer.
 */
export function isStatementTerminated(code: string): boolean {
    const trimmedEnd = code.trimEnd();
    const trimmed = code.trimStart();

    return (
        trimmedEnd.endsWith(";") ||
        trimmedEnd.endsWith("}") ||
        STATEMENT_TERMINATION_KEYWORDS.some((keyword) => trimmed.startsWith(keyword))
    );
}

/**
 * Append a trailing statement terminator when the code fragment requires one,
 * preserving existing terminators and control-flow constructs.
 */
export function ensureStatementTerminated(code: string): string {
    if (!code) {
        return code;
    }

    return isStatementTerminated(code) ? code : `${code};`;
}
