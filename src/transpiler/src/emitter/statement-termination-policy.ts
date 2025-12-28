/**
 * Result describing whether the emitter should append a statement terminator.
 */
export type StatementTerminationPolicyEvaluation = {
    shouldAppendTerminator: boolean;
};

const STATEMENT_TERMINATION_KEYWORDS = Object.freeze([
    "if",
    "for",
    "while",
    "switch",
    "try",
    "with",
    "do"
]);

function isStatementTerminated(code: string): boolean {
    const trimmed = code.trimStart();

    return (
        code.endsWith(";") ||
        code.endsWith("}") ||
        STATEMENT_TERMINATION_KEYWORDS.some((keyword) =>
            trimmed.startsWith(keyword)
        )
    );
}

/**
 * Decide whether an emitted statement fragment requires a trailing semicolon.
 *
 * Keeping this policy separate from the emitter's string concatenation makes
 * the heuristics testable in isolation and avoids coupling formatting rules to
 * the mechanics that mutate the output buffer.
 */
export function evaluateStatementTerminationPolicy(
    code: string
): StatementTerminationPolicyEvaluation {
    if (!code) {
        return { shouldAppendTerminator: false };
    }

    return {
        shouldAppendTerminator: !isStatementTerminated(code)
    };
}
