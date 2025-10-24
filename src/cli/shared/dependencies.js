export {
    applyEnvironmentOverride,
    assertArray,
    appendToCollection,
    assertFunction,
    assertNonEmptyString,
    assertPlainObject,
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
    getOrCreateMapEntry,
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
} from "../../shared/utils.js";

export { createAbortGuard } from "../../shared/abort-utils.js";

export { normalizeStringList } from "../../shared/utils/string.js";

export {
    collectAncestorDirectories,
    collectUniqueAncestorDirectories,
    isPathInside,
    resolveContainedRelativePath
} from "../../shared/utils/path.js";

export { escapeRegExp } from "../../shared/utils/regexp.js";

export { getIdentifierText } from "../../shared/ast.js";

export {
    isAggregateErrorLike,
    isErrorLike
} from "../../shared/utils/capability-probes.js";

export {
    JsonParseError,
    isJsonParseError,
    stringifyJsonForFile
} from "../../shared/json-utils.js";

export { ensureDir, isFsErrorCode } from "../../shared/fs-utils.js";
