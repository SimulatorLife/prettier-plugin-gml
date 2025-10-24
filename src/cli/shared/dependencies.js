export {
    applyEnvironmentOverride,
    assertArray,
    appendToCollection,
    assertFunction,
    assertNonEmptyString,
    assertPlainObject,
    hasOwn,
    coerceNonNegativeInteger,
    coercePositiveInteger,
    createEnvConfiguredValue,
    createEnvConfiguredValueWithFallback,
    getErrorCode,
    getErrorMessage,
    getNonEmptyTrimmedString,
    getOrCreateMapEntry,
    isNonEmptyArray,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isErrorWithCode,
    isObjectLike,
    toMutableArray,
    normalizeIdentifierMetadataEntries,
    normalizeEnumeratedOption,
    parseJsonWithContext,
    splitLines,
    resolveIntegerOption,
    toArray,
    uniqueArray,
    toNormalizedLowerCaseSet,
    toNormalizedLowerCaseString,
    toPosixPath,
    toTrimmedString
} from "../../shared/utils.js";

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
    isJsonParseError,
    stringifyJsonForFile
} from "../../shared/json-utils.js";

export { ensureDir } from "../../shared/fs-utils.js";
