export {
    assertNonEmptyString,
    toArray,
    coercePositiveInteger,
    coerceNonNegativeInteger,
    resolveIntegerOption,
    parseJsonWithContext,
    toNormalizedLowerCaseSet,
    toNormalizedLowerCaseString,
    normalizeEnumeratedOption,
    toPosixPath,
    toTrimmedString,
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isObjectLike,
    getOrCreateMapEntry,
    applyEnvironmentOverride
} from "../../shared/utils.js";

export { normalizeStringList } from "../../shared/utils/string.js";

export {
    resolveContainedRelativePath,
    collectUniqueAncestorDirectories
} from "../../shared/path-utils.js";

export { escapeRegExp } from "../../shared/regexp.js";

export { getIdentifierText } from "../../shared/ast.js";

export {
    isAggregateErrorLike,
    isErrorLike
} from "../../shared/utils/capability-probes.js";
