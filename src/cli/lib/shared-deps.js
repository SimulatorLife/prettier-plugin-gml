export {
    coercePositiveInteger,
    coerceNonNegativeInteger,
    resolveIntegerOption,
    parseJsonWithContext,
    toNormalizedLowerCaseSet,
    toNormalizedLowerCaseString,
    toPosixPath,
    toTrimmedString,
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isObjectLike
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
