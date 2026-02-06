/**
 * Public API for doc-comment filtering, metadata, and configuration utilities.
 *
 * This module provides shared doc-comment processing functionality that can be
 * used by both printer and transforms without creating circular dependencies.
 *
 * Architectural ownership:
 * - Doc-comment module owns: function tag filtering, doc-comment line utilities, and options
 * - Consumers (printer/transforms) depend on: this public API only
 * - Dependencies: Core workspace for AST types and utilities
 */

export * from "./doc-comment-options.js";
export * from "./function-tag-filter.js";
