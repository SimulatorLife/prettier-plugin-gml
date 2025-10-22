export {
    applyEnvironmentOverride,
    assertFunction,
    assertNonEmptyString,
    assertPlainObject,
    coerceNonNegativeInteger,
    coercePositiveInteger,
    createEnvConfiguredValue,
    getErrorCode,
    getErrorMessage,
    getNonEmptyTrimmedString,
    getOrCreateMapEntry,
    isNonEmptyString,
    isObjectLike,
    normalizeIdentifierMetadataEntries,
    normalizeEnumeratedOption,
    parseJsonWithContext,
    resolveIntegerOption,
    toArray,
    toNormalizedLowerCaseSet,
    toNormalizedLowerCaseString,
    toPosixPath,
    toTrimmedString
} from "../../shared/utils.js";

export { normalizeStringList } from "../../shared/utils/string.js";

export {
    collectUniqueAncestorDirectories,
    resolveContainedRelativePath
} from "../../shared/utils/path.js";

export { escapeRegExp } from "../../shared/utils/regexp.js";

export { getIdentifierText } from "../../shared/ast.js";

export {
    isAggregateErrorLike,
    isErrorLike
} from "../../shared/utils/capability-probes.js";
