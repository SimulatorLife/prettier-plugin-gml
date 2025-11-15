// Delegate string helpers to @gml-modules/core to maintain a single
// implementation.
import { Core } from "@gml-modules/core";
const { isNonEmptyString, isNonEmptyTrimmedString, getNonEmptyTrimmedString, normalizeExtensionSuffix, getNonEmptyString, assertNonEmptyString, describeValueForError, formatWithIndefiniteArticle, isWordChar, toTrimmedString, coalesceTrimmedString, toNormalizedLowerCaseString, capitalize, createListSplitPattern, trimStringEntries, stripStringQuotes, normalizeStringList, toNormalizedLowerCaseSet } = Core;
export { isNonEmptyString, isNonEmptyTrimmedString, getNonEmptyTrimmedString, normalizeExtensionSuffix, getNonEmptyString, assertNonEmptyString, describeValueForError, formatWithIndefiniteArticle, isWordChar, toTrimmedString, coalesceTrimmedString, toNormalizedLowerCaseString, capitalize, createListSplitPattern, trimStringEntries, stripStringQuotes, normalizeStringList, toNormalizedLowerCaseSet };

