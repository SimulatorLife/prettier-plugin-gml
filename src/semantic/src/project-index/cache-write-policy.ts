import { Core } from "@gml-modules/core";

/**
 * Inputs required to evaluate the project index cache size policy.
 */
export type ProjectIndexCacheSizePolicyInput = {
    maxSizeBytes: unknown;
    payloadSizeBytes: number;
};

/**
 * Decision returned by the project index cache size policy evaluator.
 */
export type ProjectIndexCacheSizePolicyDecision =
    | {
          shouldWrite: true;
          reason: null;
          effectiveMaxSizeBytes: number | null;
      }
    | {
          shouldWrite: false;
          reason: "payload-too-large";
          effectiveMaxSizeBytes: number | null;
      };

/**
 * Normalize the cache size configuration, preserving 0 as a sentinel for
 * "no limit" and returning null for invalid values.
 */
export function normalizeProjectIndexCacheMaxSizeBytes(maxSizeBytes: unknown): number | null {
    if (maxSizeBytes === null) {
        return null;
    }

    const numericLimit = Core.toFiniteNumber(maxSizeBytes);
    if (numericLimit === null || numericLimit < 0) {
        return null;
    }

    // Explicitly preserve 0 as a sentinel value meaning "no limit"
    // rather than coercing it to null, so the caller can distinguish
    // "explicitly disabled" from "unconfigured".
    return numericLimit;
}

/**
 * Evaluate whether a cache payload should be written based on the configured
 * size ceiling. This policy is pure: it calculates the decision without
 * performing any file-system side effects.
 */
export function evaluateProjectIndexCacheSizePolicy(
    input: ProjectIndexCacheSizePolicyInput
): ProjectIndexCacheSizePolicyDecision {
    const effectiveMaxSizeBytes = normalizeProjectIndexCacheMaxSizeBytes(input.maxSizeBytes);

    // Check for a positive limit: 0 and null both mean "no limit".
    // The > 0 check implicitly handles null since (null > 0) is false.
    if (effectiveMaxSizeBytes > 0 && input.payloadSizeBytes > effectiveMaxSizeBytes) {
        return {
            shouldWrite: false,
            reason: "payload-too-large",
            effectiveMaxSizeBytes
        };
    }

    return {
        shouldWrite: true,
        reason: null,
        effectiveMaxSizeBytes
    };
}
