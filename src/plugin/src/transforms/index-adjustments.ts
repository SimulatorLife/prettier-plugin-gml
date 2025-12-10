/**
 * Shared helper for re-mapping AST location metadata after sanitized text insertions (e.g., guard characters).
 * The helper applies index adjustments to both the AST nodes and any cached metadata so callers do not need to duplicate logic.
 */
export function applyIndexAdjustmentsIfPresent(
    target,
    adjustments,
    applyAdjustments,
    metadata
) {
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
        return;
    }

    applyAdjustments(target, adjustments);

    if (metadata !== null && metadata !== undefined) {
        applyAdjustments(metadata, adjustments);
    }
}
