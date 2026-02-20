import { Core } from "@gml-modules/core";

/**
 * Shared helper for re-mapping AST location metadata after sanitized text insertions (e.g., guard characters).
 * The helper applies index adjustments to both the AST nodes and any cached metadata so callers do not need to duplicate logic.
 * Delegates to the canonical Core implementation.
 */
export const applyIndexAdjustmentsIfPresent = Core.applyIndexAdjustmentsIfPresent;

