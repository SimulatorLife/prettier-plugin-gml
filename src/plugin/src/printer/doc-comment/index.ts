/**
 * Public API for doc-comment printing.
 *
 * This module provides the doc-comment printing infrastructure including function
 * doc processing and synthetic doc-comment generation.
 *
 * Architectural boundaries:
 * - Printer owns: Doc-comment formatting and Prettier doc builders
 * - Transforms consume: Shared doc-comment options (from doc-comment module)
 * - Printer consumes: Transform utilities (DescriptionUtils, NormalizationUtils)
 *
 * Dependencies flow: Core → Shared doc-comment → Transforms ↔ Printer
 */

export * from "./function-docs.js";
export * from "./synthetic-doc-comment-builder.js";
