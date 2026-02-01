/**
 * Inputs required to evaluate the undo stack trim policy.
 */
export interface UndoStackTrimContext {
    maxSize: number;
    currentSize: number;
}

/**
 * Decision returned by the undo stack trim policy evaluator.
 */
export interface UndoStackTrimDecision {
    shouldTrim: boolean;
    trimCount: number;
    targetSize: number;
    reason: "within-limit" | "unbounded" | "exceeds-limit";
}

/**
 * Evaluate whether the undo stack should be trimmed and by how much. This policy
 * is pure: it calculates the decision without mutating any runtime state.
 */
export function evaluateUndoStackTrimPolicy(context: UndoStackTrimContext): UndoStackTrimDecision {
    const { maxSize, currentSize } = context;

    if (maxSize <= 0) {
        return {
            shouldTrim: false,
            trimCount: 0,
            targetSize: currentSize,
            reason: "unbounded"
        };
    }

    if (currentSize <= maxSize) {
        return {
            shouldTrim: false,
            trimCount: 0,
            targetSize: currentSize,
            reason: "within-limit"
        };
    }

    const trimCount = currentSize - maxSize;

    return {
        shouldTrim: true,
        trimCount,
        targetSize: maxSize,
        reason: "exceeds-limit"
    };
}
