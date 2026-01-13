/**
 * Public API for doc-comment filtering and metadata utilities.
 *
 * This module provides shared doc-comment processing functionality that can be
 * used by both printer and transforms without creating circular dependencies.
 *
 * Architectural ownership:
 * - Doc-comment module owns: function tag filtering and doc-comment line utilities
 * - Consumers (printer/transforms) depend on: this public API only
 * - Dependencies: Core workspace for AST types
 */

export * from "./function-tag-filter.js";
