// Delegate string helpers to @gml-modules/core to maintain a single
// implementation.
export {
    isNonEmptyString,
    isNonEmptyTrimmedString,
    getNonEmptyTrimmedString,
    normalizeExtensionSuffix,
    getNonEmptyString,
    assertNonEmptyString,
    describeValueForError,
    formatWithIndefiniteArticle,
    isWordChar,
    toTrimmedString,
    coalesceTrimmedString,
    toNormalizedLowerCaseString,
    capitalize,
    createListSplitPattern,
    trimStringEntries,
    stripStringQuotes,
    normalizeStringList,
    toNormalizedLowerCaseSet
} from "@gml-modules/core";
