// Centralize the subset of shared utilities consumed by the plugin so internal
// modules rely on an explicit contract instead of the entire shared surface.
// Narrowing the re-exported API keeps the plugin decoupled from unrelated CLI
// helpers while still allowing imports to remain stable.
export {
    getCommentArray,
    hasComment,
    isCommentNode,
    isLineComment
} from "@gml-modules/core";

export {
    assignClonedLocation,
    cloneLocation,
    getNodeStartIndex,
    getNodeEndIndex,
    getNodeRangeIndices,
    getNodeStartLine,
    getNodeEndLine
} from "@gml-modules/core";

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
} from "@gml-modules/core";

export {
    asArray,
    compactArray,
    isArrayIndex,
    isNonEmptyArray,
    toMutableArray
} from "@gml-modules/core";

export {
    assertFunction,
    assertPlainObject,
    coalesceOption,
    getOrCreateMapEntry,
    hasOwn,
    isObjectLike,
    isObjectOrFunction,
    resolveHelperOverride
} from "@gml-modules/core";

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
} from "@gml-modules/core";

export { coercePositiveIntegerOption } from "@gml-modules/core";

export { isFiniteNumber, toFiniteNumber } from "@gml-modules/core";

export { escapeRegExp } from "@gml-modules/core";

export {
    ensureSet,
    hasIterableItems,
    isMapLike,
    isRegExpLike,
    isSetLike
} from "@gml-modules/core";

export {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback
} from "@gml-modules/core";

export { isAbortError, resolveAbortSignalFromOptions } from "@gml-modules/core";

export { noop } from "@gml-modules/core";

export { normalizeEnumeratedOption } from "@gml-modules/core";

export { createMetricsTracker } from "@gml-modules/core";

export { fromPosixPath } from "@gml-modules/core";
