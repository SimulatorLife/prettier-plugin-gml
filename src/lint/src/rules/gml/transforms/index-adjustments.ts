import { Core } from "@gml-modules/core";

/**
 * Re-maps AST location metadata after sanitized text insertions to maintain consistency.
 *
 * Delegates to the canonical Core implementation so the lint workspace does not
 * maintain a separate untyped copy. The function applies index adjustments to
 * both the AST nodes and any cached metadata so callers do not need to
 * duplicate logic.
 *
 * Canonical implementation: `src/core/src/ast/index-adjustments.ts`
 */
export const applyIndexAdjustmentsIfPresent = Core.applyIndexAdjustmentsIfPresent;
