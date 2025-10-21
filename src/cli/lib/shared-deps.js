export {
    applyEnvironmentOverride,
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
    normalizeEnumeratedOption,
    parseJsonWithContext,
    resolveIntegerOption,
    toArray,
    toNormalizedLowerCaseSet,
    toNormalizedLowerCaseString,
    toPosixPath,
    toTrimmedString
} from "./shared/utils.js";

export { normalizeStringList } from "./shared/utils/string.js";

export {
    collectUniqueAncestorDirectories,
    resolveContainedRelativePath
} from "./shared/path-utils.js";

export { escapeRegExp } from "./shared/regexp.js";

export { getIdentifierText } from "./shared/ast.js";

export {
    isAggregateErrorLike,
    isErrorLike
} from "./shared/utils/capability-probes.js";
