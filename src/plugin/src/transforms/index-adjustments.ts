/**
 * Shared helper for re-mapping AST location metadata after sanitized text insertions (e.g., guard characters).
 * The helper applies index adjustments to both the AST nodes and any cached metadata so callers do not need to duplicate logic.
 */
import { Core } from "@gml-modules/core";

export function createIndexMapper(insertPositions: Array<number | null | undefined> | null | undefined) {
    const offsets = Core.isNonEmptyArray(insertPositions)
        ? [
            ...new Set(
                insertPositions.filter(
                    (position): position is number => typeof position === "number" && Number.isFinite(position)
                )
            )
        ].toSorted((a, b) => a - b)
        : [];

    if (offsets.length === 0) {
        return Core.identity;
    }

    return (index: unknown) => {
        if (typeof index !== "number") {
            return index;
        }

        const precedingInsertions = offsets.filter((offset) => index > offset).length;
        return index - precedingInsertions;
    };
}

export function applyIndexAdjustmentsIfPresent(target, adjustments, applyAdjustments, metadata) {
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
        return;
    }

    const mapIndex = createIndexMapper(adjustments);
    applyAdjustments(target, mapIndex);

    if (metadata !== null && metadata !== undefined) {
        applyAdjustments(metadata, mapIndex);
    }
}
