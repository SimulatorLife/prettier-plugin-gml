import { Core } from "@gml-modules/core";

/**
 * Re-maps AST location metadata after text insertions to maintain consistency.
 *
 * This utility handles the translation of indices when a transform modifies the
 * source text by inserting characters. It is primarily used by the
 * missing-argument-separator sanitizer to ensure that location markers in the
 * AST remain valid relative to the original source text or any cached metadata.
 *
 * This function is a thin wrapper around the Core implementation.
 *
 * @param indexAdjustments - Array of numeric offsets where characters were inserted.
 */
export const applyIndexAdjustmentsIfPresent = Core.applyIndexAdjustmentsIfPresent;
