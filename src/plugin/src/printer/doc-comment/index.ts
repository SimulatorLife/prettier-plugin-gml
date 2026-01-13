/**
 * Public API for doc-comment printing.
 *
 * This module provides the doc-comment printing infrastructure including options
 * resolution, function doc processing, and synthetic doc-comment generation.
 *
 * Architectural boundaries:
 * - Printer owns: Doc-comment formatting, options, and Prettier doc builders
 * - Transforms consume: Printer options (via resolveDocCommentPrinterOptions)
 * - Printer consumes: Transform utilities (DescriptionUtils, NormalizationUtils)
 *
 * Dependencies flow: Core → Shared utilities (doc-comment, comments) → Transforms ↔ Printer
 */

export * from "./doc-comment-options.js";
export * from "./function-docs.js";
export * from "./synthetic-doc-comments.js";
export * from "./synthetic-doc-comment-builder.js";
