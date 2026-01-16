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
 *
 * Architectural boundaries:
 * - Core/utils owns: Array, string, object, and AST utilities
 * - Core/comments/doc-comment owns: Doc-comment-specific logic
 * - This facade: Re-exports only the utilities needed by doc-comment code
 *
 * All doc-comment service files should import from this facade, never
 * directly from ../../utils/ paths.
 */

// Array utilities
export { asArray, compactArray, findLastIndex, isNonEmptyArray, toMutableArray } from "../../utils/index.js";

// String utilities
export {
    capitalize,
    getNonEmptyString,
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    toNormalizedLowerCaseString,
    toTrimmedString
} from "../../utils/index.js";

// Numeric utilities
export { clamp, coercePositiveIntegerOption } from "../../utils/index.js";

// Object utilities
export { assertFunction } from "../../utils/index.js";

// Capability probes
export { isRegExpLike } from "../../utils/index.js";

// AST node helpers
export {
    getBodyStatements,
    getIdentifierText,
    getNodeName,
    getSingleVariableDeclarator,
    isFunctionLikeNode,
    isNode,
    isUndefinedSentinel
} from "../../ast/index.js";

// AST location helpers
export { getNodeEndIndex, getNodeStartIndex } from "../../ast/index.js";

// AST types
export type { MutableGameMakerAstNode } from "../../ast/index.js";

// Comment utilities
export { getCommentArray, isLineComment } from "../comment-utils.js";
export type { DocCommentLines, MutableDocCommentLines } from "../comment-utils.js";

// Line comment utilities
export { formatLineComment, getLineCommentRawText, resolveLineCommentOptions } from "../line-comment/index.js";
