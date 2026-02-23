/**
 * Public API for doc-comment transforms and utilities.
 *
 * This module provides the doc-comment normalization transform and utilities for
 * processing description lines and normalization metadata. These can be consumed
 * by the printer without creating circular dependencies.
 *
 * Architectural boundaries:
 * - Transforms own: AST normalization, description processing, metadata management
 * - Printer consumes: DescriptionUtils, NormalizationUtils namespaces
 * - Transforms consume: Printer options (via public API), shared doc-comment utilities
 *
 * The DescriptionUtils and NormalizationUtils are exported as namespaces to provide
 * clean, discoverable APIs for consumers while keeping implementation details private.
 */

import { Core } from "@gml-modules/core";

export * as NormalizationUtils from "./normalization-utils.js";
export type { DocCommentNodeMetadata as DocCommentMetadata } from "@gml-modules/core";
export { Core as DescriptionUtils } from "@gml-modules/core";
export const {
    getDeprecatedDocCommentFunctionSet,
    getDocCommentNodeMetadata: getDocCommentMetadata,
    setDeprecatedDocCommentFunctionSet,
    setDocCommentNodeMetadata: setDocCommentMetadata
} = Core;
