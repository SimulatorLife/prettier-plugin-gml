import type { UnsafeReasonCode } from "../types/index.js";

export const UNSAFE_REASON_CODES = Object.freeze({
    MISSING_PROJECT_CONTEXT: "MISSING_PROJECT_CONTEXT",
    NAME_COLLISION: "NAME_COLLISION",
    CROSS_FILE_CONFLICT: "CROSS_FILE_CONFLICT",
    SEMANTIC_AMBIGUITY: "SEMANTIC_AMBIGUITY",
    NON_IDEMPOTENT_EXPRESSION: "NON_IDEMPOTENT_EXPRESSION"
} as const satisfies Record<UnsafeReasonCode, UnsafeReasonCode>);
