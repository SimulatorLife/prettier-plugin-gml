/**
 * Policy evaluator for status server readiness and health checks.
 *
 * Separates the policy rules (thresholds and heuristics) from the status
 * server's HTTP response mechanics so behavior can be validated independently.
 */

/**
 * Health status levels for the transpilation check.
 */
export type TranspilationHealthStatus = "pass" | "warn";

/**
 * Configuration values for the status health policy.
 */
export interface StatusHealthPolicyConfig {
    readinessSuccessToErrorRatio: number;
}

/**
 * Minimal snapshot values required to evaluate health and readiness.
 */
export interface StatusHealthSnapshot {
    patchCount: number;
    errorCount: number;
}

/**
 * Decision payload for transpilation health evaluation.
 */
export interface TranspilationHealthDecision {
    status: TranspilationHealthStatus;
    patchCount: number;
    errorCount: number;
}

/**
 * Decision payload for readiness evaluation.
 */
export interface ReadinessDecision {
    isReady: boolean;
}

/**
 * Default policy configuration for status server health and readiness checks.
 */
export const DEFAULT_STATUS_HEALTH_POLICY_CONFIG: StatusHealthPolicyConfig = Object.freeze({
    readinessSuccessToErrorRatio: 2
});

/**
 * Evaluate the transpilation health status for the status server.
 *
 * @param snapshot - Status snapshot counts used for evaluation.
 * @returns Decision with the computed health status.
 */
export function evaluateTranspilationHealth(snapshot: StatusHealthSnapshot): TranspilationHealthDecision {
    const status: TranspilationHealthStatus =
        snapshot.errorCount === 0 || snapshot.patchCount > snapshot.errorCount ? "pass" : "warn";

    return {
        status,
        patchCount: snapshot.patchCount,
        errorCount: snapshot.errorCount
    };
}

/**
 * Evaluate readiness based on success-to-error ratio thresholds.
 *
 * @param snapshot - Status snapshot counts used for evaluation.
 * @param config - Policy configuration for readiness thresholds.
 * @returns Decision describing readiness.
 */
export function evaluateReadiness(snapshot: StatusHealthSnapshot, config: StatusHealthPolicyConfig): ReadinessDecision {
    const isReady =
        snapshot.errorCount === 0 || snapshot.patchCount > snapshot.errorCount * config.readinessSuccessToErrorRatio;

    return { isReady };
}
