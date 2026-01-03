/**
 * Local facade for utility functions used by doc-comment processing.
 *
 * This file serves as a stable abstraction layer between the doc-comment
 * subsystem and the core utilities. By centralizing imports here, we:
 *
 * 1. Reduce coupling: service files depend on a local contract rather than
 *    deep relative paths (../../../utils/...)
 * 2. Improve maintainability: changes to utility organization only require
 *    updates to this single facade
 * 3. Enhance clarity: explicitly documents which utilities the doc-comment
 *    subsystem depends on
 *
 * This follows the architectural principle that modules should depend on
 * stable public APIs rather than implementation details.
 */

// Array utilities
export { asArray, compactArray, findLastIndex, isNonEmptyArray, toMutableArray } from "../../utils/array.js";

// String utilities
export {
    capitalize,
    getNonEmptyString,
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    toNormalizedLowerCaseString,
    toTrimmedString
} from "../../utils/string.js";

// Numeric utilities
export { clamp } from "../../utils/number.js";
export { coercePositiveIntegerOption } from "../../utils/numeric-options.js";

// Object utilities
export { assertFunction } from "../../utils/object.js";

// Capability probes
export { isRegExpLike } from "../../utils/capability-probes.js";
