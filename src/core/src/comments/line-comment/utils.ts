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
 */

// Object utilities
export { assertFunction, isObjectLike } from "../../utils/object.js";

// String utilities
export { isNonEmptyString, toTrimmedString } from "../../utils/string.js";

// Capability probes
export { isRegExpLike } from "../../utils/capability-probes.js";
