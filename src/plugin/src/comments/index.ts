/**
 * Public API for comment handling utilities.
 *
 * This module exports the comment printing infrastructure and normalization
 * utilities that can be safely consumed by other parts of the plugin (printer,
 * transforms) without creating circular dependencies.
 *
 * Architectural ownership:
 * - Comments module owns: comment detection, normalization, and printing
 * - Consumers (printer/transforms) depend on: this public API only
 * - Dependencies: Core workspace for AST types and utilities
 */

export {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comment-printer.js";
export { normalizeDocLikeLineComment } from "./doc-like-line-normalization.js";
