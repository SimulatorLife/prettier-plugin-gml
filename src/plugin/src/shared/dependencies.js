// Centralize the subset of shared utilities consumed by the plugin so internal
// modules rely on an explicit contract instead of the entire shared surface.
// Narrowing the re-exported API keeps the plugin decoupled from unrelated CLI
// helpers while still allowing imports to remain stable.
import { Core } from "@gml-modules/core";
const { AST: { getCommentArray, hasComment, isCommentNode, isLineComment } } = Core;
export { getCommentArray, hasComment, isCommentNode, isLineComment };


import { Core } from "@gml-modules/core";
const { AST: { assignClonedLocation, cloneLocation, getNodeStartIndex, getNodeEndIndex, getNodeRangeIndices, getNodeStartLine, getNodeEndLine } } = Core;
export { assignClonedLocation, cloneLocation, getNodeStartIndex, getNodeEndIndex, getNodeRangeIndices, getNodeStartLine, getNodeEndLine };


import { Core } from "@gml-modules/core";
const { AST: { cloneAstNode, createIdentifierNode, enqueueObjectChildValues, forEachNodeChild, getArrayProperty, getBodyStatements, getBooleanLiteralValue, getCallExpressionArguments, getCallExpressionIdentifier, getCallExpressionIdentifierName, getIdentifierText, getNodeType, getSingleMemberIndexPropertyEntry, getSingleVariableDeclarator, isBooleanLiteral, isCallExpressionIdentifierMatch, isFunctionLikeNode, isNode, isProgramOrBlockStatement, isUndefinedSentinel, isVarVariableDeclaration, unwrapParenthesizedExpression, visitChildNodes } } = Core;
export { cloneAstNode, createIdentifierNode, enqueueObjectChildValues, forEachNodeChild, getArrayProperty, getBodyStatements, getBooleanLiteralValue, getCallExpressionArguments, getCallExpressionIdentifier, getCallExpressionIdentifierName, getIdentifierText, getNodeType, getSingleMemberIndexPropertyEntry, getSingleVariableDeclarator, isBooleanLiteral, isCallExpressionIdentifierMatch, isFunctionLikeNode, isNode, isProgramOrBlockStatement, isUndefinedSentinel, isVarVariableDeclaration, unwrapParenthesizedExpression, visitChildNodes };


import { Core } from "@gml-modules/core";
const { Utils: { asArray, compactArray, isArrayIndex, isNonEmptyArray, toMutableArray } } = Core;
export { asArray, compactArray, isArrayIndex, isNonEmptyArray, toMutableArray };


import { Core } from "@gml-modules/core";
const { Utils: { assertFunction, assertPlainObject, coalesceOption, getOrCreateMapEntry, hasOwn, isObjectLike, isObjectOrFunction, resolveHelperOverride } } = Core;
export { assertFunction, assertPlainObject, coalesceOption, getOrCreateMapEntry, hasOwn, isObjectLike, isObjectOrFunction, resolveHelperOverride };


import { Core } from "@gml-modules/core";
const { Utils: { capitalize, describeValueForError, getNonEmptyString, getNonEmptyTrimmedString, isNonEmptyString, isNonEmptyTrimmedString, normalizeStringList, stripStringQuotes, toNormalizedLowerCaseString, toTrimmedString } } = Core;
export { capitalize, describeValueForError, getNonEmptyString, getNonEmptyTrimmedString, isNonEmptyString, isNonEmptyTrimmedString, normalizeStringList, stripStringQuotes, toNormalizedLowerCaseString, toTrimmedString };


import { Core } from "@gml-modules/core";
const { Utils: { coercePositiveIntegerOption } } = Core;
export { coercePositiveIntegerOption };


import { Core } from "@gml-modules/core";
const { Utils: { isFiniteNumber, toFiniteNumber } } = Core;
export { isFiniteNumber, toFiniteNumber };


import { Core } from "@gml-modules/core";
const { Utils: { escapeRegExp } } = Core;
export { escapeRegExp };


import { Core } from "@gml-modules/core";
const { Utils: { ensureSet, hasIterableItems, isMapLike, isRegExpLike, isSetLike } } = Core;
export { ensureSet, hasIterableItems, isMapLike, isRegExpLike, isSetLike };


import { Core } from "@gml-modules/core";
const { Utils: { applyConfiguredValueEnvOverride, createEnvConfiguredValueWithFallback } } = Core;
export { applyConfiguredValueEnvOverride, createEnvConfiguredValueWithFallback };


import { Core } from "@gml-modules/core";
const { Utils: { isAbortError, resolveAbortSignalFromOptions } } = Core;
export { isAbortError, resolveAbortSignalFromOptions };


import { Core } from "@gml-modules/core";
const { Utils: { noop } } = Core;
export { noop };


import { Core } from "@gml-modules/core";
const { Utils: { normalizeEnumeratedOption } } = Core;
export { normalizeEnumeratedOption };


import { Core } from "@gml-modules/core";
const { Reporting: { createMetricsTracker } } = Core;
export { createMetricsTracker };


import { Core } from "@gml-modules/core";
const { FS: { fromPosixPath } } = Core;
export { fromPosixPath };

