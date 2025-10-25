export {
    applyEnvironmentOverride,
    assertArray,
    asArray,
    assertFunction,
    assertNonEmptyString,
    assertPlainObject,
    resolveFunction,
    hasOwn,
    identity,
    coerceNonNegativeInteger,
    coercePositiveInteger,
    createEnvConfiguredValue,
    createEnvConfiguredValueWithFallback,
    getErrorCode,
    getErrorMessage,
    getErrorMessageOrFallback,
    getNonEmptyTrimmedString,
    isMissingModuleDependency,
    getOrCreateMapEntry,
    incrementMapValue,
    isFiniteNumber,
    isNonEmptyArray,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isErrorWithCode,
    isObjectLike,
    toMutableArray,
    normalizeIdentifierMetadataEntries,
    normalizeEnumeratedOption,
    parseJsonObjectWithContext,
    parseJsonWithContext,
    splitLines,
    resolveIntegerOption,
    resolveModuleDefaultExport,
    toArray,
    toNormalizedInteger,
    uniqueArray,
    toNormalizedLowerCaseSet,
    toNormalizedLowerCaseString,
    toPosixPath,
    toTrimmedString
} from "../dependencies.js";

export { resolveCommandUsage } from "../core/command-usage.js";

export { appendToCollection } from "../core/collection-utils.js";

export { createAbortGuard } from "../dependencies.js";

export {
    normalizeStringList,
    createListSplitPattern,
    collectAncestorDirectories,
    collectUniqueAncestorDirectories,
    isPathInside,
    resolveContainedRelativePath,
    escapeRegExp
} from "../dependencies.js";

export { getIdentifierText } from "../dependencies.js";

export {
    isAggregateErrorLike,
    isErrorLike,
    ensureMap
} from "../dependencies.js";

export {
    JsonParseError,
    isJsonParseError,
    stringifyJsonForFile
} from "../dependencies.js";

export { ensureDir, isFsErrorCode } from "../dependencies.js";
