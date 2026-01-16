/**
 * Local facade for utility functions used by line-comment processing.
 *
 * This file serves as a stable abstraction layer between the line-comment
 * subsystem and the core utilities. By centralizing imports here, we:
 *
 * 1. Reduce coupling: line-comment files depend on a local contract rather than
 *    deep relative paths (../../utils/...)
 * 2. Improve maintainability: changes to utility organization only require
 *    updates to this single facade
 * 3. Enhance clarity: explicitly documents which utilities the line-comment
 *    subsystem depends on
 *
 * This follows the architectural principle that modules should depend on
 * stable public APIs rather than implementation details.
 *
 * Architectural boundaries:
 * - Core/utils owns: Object, string, and capability probe utilities
 * - Core/comments/line-comment owns: Line-comment-specific processing
 * - This facade: Re-exports only the utilities needed by line-comment code
 *
 * All line-comment files should import from this facade, never directly
 * from ../../utils/ paths.
 */

// Object utilities
export { assertFunction, isObjectLike } from "../../utils/index.js";

// String utilities
export { isNonEmptyString, toTrimmedString } from "../../utils/index.js";

// Capability probes
export { isRegExpLike } from "../../utils/index.js";
