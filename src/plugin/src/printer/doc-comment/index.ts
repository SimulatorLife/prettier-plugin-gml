/**
 * Public API for doc-comment printing.
 *
 * This module provides doc-comment printing helpers that preserve/format existing
 * comments only. Synthetic tag generation is lint-owned.
 *
 * Architectural boundaries:
 * - Printer owns: Doc-comment formatting and Prettier doc builders
 * - Transforms consume: Shared doc-comment options (from doc-comment module)
 * - Printer consumes: Transform utilities (DescriptionUtils, NormalizationUtils)
 *
 * Dependencies flow: Core → Shared doc-comment → Transforms ↔ Printer
 */

export * from "./function-docs.js";
