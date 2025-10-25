export {
    applyEnvironmentOverride,
    assertArray,
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
} from "../../shared/index.js";

export { appendToCollection } from "../core/collection-utils.js";

export { createAbortGuard } from "../../shared/index.js";

export { normalizeStringList } from "../../shared/utils/string.js";

export {
    collectAncestorDirectories,
    collectUniqueAncestorDirectories,
    isPathInside,
    resolveContainedRelativePath
} from "../../shared/utils/path.js";

export { escapeRegExp } from "../../shared/utils/regexp.js";

export { getIdentifierText } from "../../shared/index.js";

export {
    isAggregateErrorLike,
    isErrorLike,
    ensureMap
} from "../../shared/index.js";

export {
    JsonParseError,
    isJsonParseError,
    stringifyJsonForFile
} from "../../shared/index.js";

export { ensureDir, isFsErrorCode } from "../../shared/index.js";
