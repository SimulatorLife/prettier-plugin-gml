// Centralize the subset of shared utilities consumed by the plugin so internal
// modules rely on an explicit contract instead of the entire shared surface.
// Narrowing the re-exported API keeps the plugin decoupled from unrelated CLI
// helpers while still allowing imports to remain stable.
export {
    getCommentArray,
    hasComment,
    isCommentNode,
    isLineComment
} from "@prettier-plugin-gml/shared/ast/comments.js";

export {
    assignClonedLocation,
    cloneLocation,
    getNodeStartIndex,
    getNodeEndIndex,
    getNodeRangeIndices,
    getNodeStartLine,
    getNodeEndLine
} from "@prettier-plugin-gml/shared/ast/locations.js";

export {
    cloneAstNode,
    createIdentifierNode,
    enqueueObjectChildValues,
    forEachNodeChild,
    getArrayProperty,
    getBodyStatements,
    getBooleanLiteralValue,
    getCallExpressionArguments,
    getCallExpressionIdentifier,
    getCallExpressionIdentifierName,
    getIdentifierText,
    getNodeType,
    getSingleMemberIndexPropertyEntry,
    getSingleVariableDeclarator,
    isBooleanLiteral,
    isCallExpressionIdentifierMatch,
    isFunctionLikeNode,
    isNode,
    isProgramOrBlockStatement,
    isUndefinedSentinel,
    isVarVariableDeclaration,
    unwrapParenthesizedExpression,
    visitChildNodes
} from "@prettier-plugin-gml/shared/ast/node-helpers.js";

export {
    asArray,
    compactArray,
    isArrayIndex,
    isNonEmptyArray,
    toMutableArray
} from "@prettier-plugin-gml/shared/utils/array.js";

export {
    assertFunction,
    assertPlainObject,
    coalesceOption,
    getOrCreateMapEntry,
    hasOwn,
    isObjectLike,
    isObjectOrFunction,
    resolveHelperOverride
} from "@prettier-plugin-gml/shared/utils/object.js";

export {
    capitalize,
    describeValueForError,
    getNonEmptyString,
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    normalizeStringList,
    stripStringQuotes,
    toNormalizedLowerCaseString,
    toTrimmedString
} from "@prettier-plugin-gml/shared/utils/string.js";

export { coercePositiveIntegerOption } from "@prettier-plugin-gml/shared/utils/numeric-options.js";

export {
    isFiniteNumber,
    toFiniteNumber
} from "@prettier-plugin-gml/shared/utils/number.js";

export { escapeRegExp } from "@prettier-plugin-gml/shared/utils/regexp.js";

export {
    ensureSet,
    hasIterableItems,
    isMapLike,
    isRegExpLike,
    isSetLike
} from "@prettier-plugin-gml/shared/utils/capability-probes.js";

export {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback
} from "@prettier-plugin-gml/shared/utils/environment.js";

export {
    isAbortError,
    resolveAbortSignalFromOptions
} from "@prettier-plugin-gml/shared/utils/abort.js";

export { noop } from "@prettier-plugin-gml/shared/utils/function.js";

export { normalizeEnumeratedOption } from "@prettier-plugin-gml/shared/utils/enumerated-options.js";

export { createMetricsTracker } from "@prettier-plugin-gml/shared/reporting/metrics.js";

export { fromPosixPath } from "@prettier-plugin-gml/shared/fs/path.js";
