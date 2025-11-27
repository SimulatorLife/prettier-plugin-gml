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
