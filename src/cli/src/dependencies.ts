// TODO: Remove this file and have consumers do direct imports from Core
import { Core } from "@gml-modules/core";

type CoreBindings = typeof Core;

const appendToCollection: CoreBindings["appendToCollection"] =
    Core.appendToCollection;
const applyEnvironmentOverride: CoreBindings["applyEnvironmentOverride"] =
    Core.applyEnvironmentOverride;
const areNumbersApproximatelyEqual: CoreBindings["areNumbersApproximatelyEqual"] =
    Core.areNumbersApproximatelyEqual;
const asArray: CoreBindings["asArray"] = Core.asArray;
const assertArray: CoreBindings["assertArray"] = Core.assertArray;
const assertFunction: CoreBindings["assertFunction"] = Core.assertFunction;
const assertFunctionProperties: CoreBindings["assertFunctionProperties"] =
    Core.assertFunctionProperties;
const assertNonEmptyString: CoreBindings["assertNonEmptyString"] =
    Core.assertNonEmptyString;
const assertPlainObject: CoreBindings["assertPlainObject"] =
    Core.assertPlainObject;
const coerceNonNegativeInteger: CoreBindings["coerceNonNegativeInteger"] =
    Core.coerceNonNegativeInteger;
const coercePositiveInteger: CoreBindings["coercePositiveInteger"] =
    Core.coercePositiveInteger;
const compactArray: CoreBindings["compactArray"] = Core.compactArray;
const createAbortGuard: CoreBindings["createAbortGuard"] =
    Core.createAbortGuard;
const createEnvConfiguredValue: CoreBindings["createEnvConfiguredValue"] =
    Core.createEnvConfiguredValue;
const createEnvConfiguredValueWithFallback: CoreBindings["createEnvConfiguredValueWithFallback"] =
    Core.createEnvConfiguredValueWithFallback;
const createListSplitPattern: CoreBindings["createListSplitPattern"] =
    Core.createListSplitPattern;
const createNumericTypeErrorFormatter: CoreBindings["createNumericTypeErrorFormatter"] =
    Core.createNumericTypeErrorFormatter;
const describeValueForError: CoreBindings["describeValueForError"] =
    Core.describeValueForError;
const describeValueWithArticle: CoreBindings["describeValueWithArticle"] =
    Core.describeValueWithArticle;
const ensureMap: CoreBindings["ensureMap"] = Core.ensureMap;
const escapeRegExp: CoreBindings["escapeRegExp"] = Core.escapeRegExp;
const getErrorCode: CoreBindings["getErrorCode"] = Core.getErrorCode;
const getErrorMessage: CoreBindings["getErrorMessage"] = Core.getErrorMessage;
const getErrorMessageOrFallback: CoreBindings["getErrorMessageOrFallback"] =
    Core.getErrorMessageOrFallback;
const getIdentifierText: CoreBindings["getIdentifierText"] =
    Core.getIdentifierText;
const getNonEmptyTrimmedString: CoreBindings["getNonEmptyTrimmedString"] =
    Core.getNonEmptyTrimmedString;
const getOrCreateMapEntry: CoreBindings["getOrCreateMapEntry"] =
    Core.getOrCreateMapEntry;
const getObjectTagName: CoreBindings["getObjectTagName"] =
    Core.getObjectTagName;
const callWithFallback: CoreBindings["callWithFallback"] =
    Core.callWithFallback;
const identity: CoreBindings["identity"] = Core.identity;
const incrementMapValue: CoreBindings["incrementMapValue"] =
    Core.incrementMapValue;
const isAggregateErrorLike: CoreBindings["isAggregateErrorLike"] =
    Core.isAggregateErrorLike;
const isErrorLike: CoreBindings["isErrorLike"] = Core.isErrorLike;
const isErrorWithCode: CoreBindings["isErrorWithCode"] = Core.isErrorWithCode;
const isFiniteNumber: CoreBindings["isFiniteNumber"] = Core.isFiniteNumber;
const isFsErrorCode: CoreBindings["isFsErrorCode"] = Core.isFsErrorCode;
const isJsonParseError: CoreBindings["isJsonParseError"] =
    Core.isJsonParseError;
const isNonEmptyArray: CoreBindings["isNonEmptyArray"] = Core.isNonEmptyArray;
const isNonEmptyString: CoreBindings["isNonEmptyString"] =
    Core.isNonEmptyString;
const isNonEmptyTrimmedString: CoreBindings["isNonEmptyTrimmedString"] =
    Core.isNonEmptyTrimmedString;
const isObjectLike: CoreBindings["isObjectLike"] = Core.isObjectLike;
const isObjectOrFunction: CoreBindings["isObjectOrFunction"] =
    Core.isObjectOrFunction;
const isPathInside: CoreBindings["isPathInside"] = Core.isPathInside;
const JsonParseError: CoreBindings["JsonParseError"] = Core.JsonParseError;
const mergeUniqueValues: CoreBindings["mergeUniqueValues"] =
    Core.mergeUniqueValues;
const noop: CoreBindings["noop"] = Core.noop;
const normalizeEnumeratedOption: CoreBindings["normalizeEnumeratedOption"] =
    Core.normalizeEnumeratedOption;
const normalizeExtensionSuffix: CoreBindings["normalizeExtensionSuffix"] =
    Core.normalizeExtensionSuffix;
const normalizeIdentifierMetadataEntries: CoreBindings["normalizeIdentifierMetadataEntries"] =
    Core.normalizeIdentifierMetadataEntries;
const normalizeStringList: CoreBindings["normalizeStringList"] =
    Core.normalizeStringList;
const parseJsonObjectWithContext: CoreBindings["parseJsonObjectWithContext"] =
    Core.parseJsonObjectWithContext;
const parseJsonWithContext: CoreBindings["parseJsonWithContext"] =
    Core.parseJsonWithContext;
const pushUnique: CoreBindings["pushUnique"] = Core.pushUnique;
const resolveContainedRelativePath: CoreBindings["resolveContainedRelativePath"] =
    Core.resolveContainedRelativePath;
const resolveEnvironmentMap: CoreBindings["resolveEnvironmentMap"] =
    Core.resolveEnvironmentMap;
const resolveIntegerOption: CoreBindings["resolveIntegerOption"] =
    Core.resolveIntegerOption;
const splitLines: CoreBindings["splitLines"] = Core.splitLines;
const stringifyJsonForFile: CoreBindings["stringifyJsonForFile"] =
    Core.stringifyJsonForFile;
const formatWithIndefiniteArticle: CoreBindings["formatWithIndefiniteArticle"] =
    Core.formatWithIndefiniteArticle;
const toArray: CoreBindings["toArray"] = Core.toArray;
const toArrayFromIterable: CoreBindings["toArrayFromIterable"] =
    Core.toArrayFromIterable;
const toMutableArray: CoreBindings["toMutableArray"] = Core.toMutableArray;
const toFiniteNumber: CoreBindings["toFiniteNumber"] = Core.toFiniteNumber;
const toNormalizedInteger: CoreBindings["toNormalizedInteger"] =
    Core.toNormalizedInteger;
const toNormalizedLowerCaseSet: CoreBindings["toNormalizedLowerCaseSet"] =
    Core.toNormalizedLowerCaseSet;
const toNormalizedLowerCaseString: CoreBindings["toNormalizedLowerCaseString"] =
    Core.toNormalizedLowerCaseString;
const toPosixPath: CoreBindings["toPosixPath"] = Core.toPosixPath;
const toTrimmedString: CoreBindings["toTrimmedString"] = Core.toTrimmedString;
const uniqueArray: CoreBindings["uniqueArray"] = Core.uniqueArray;
const walkAncestorDirectories: CoreBindings["walkAncestorDirectories"] =
    Core.walkAncestorDirectories;
const withObjectLike: CoreBindings["withObjectLike"] = Core.withObjectLike;
const createVerboseDurationLogger: CoreBindings["createVerboseDurationLogger"] =
    Core.createVerboseDurationLogger;
const formatDuration: CoreBindings["formatDuration"] = Core.formatDuration;
const timeSync: CoreBindings["timeSync"] = Core.timeSync;

export {
    appendToCollection,
    applyEnvironmentOverride,
    areNumbersApproximatelyEqual,
    asArray,
    assertArray,
    assertFunction,
    assertFunctionProperties,
    assertNonEmptyString,
    assertPlainObject,
    coerceNonNegativeInteger,
    coercePositiveInteger,
    compactArray,
    createAbortGuard,
    createEnvConfiguredValue,
    createEnvConfiguredValueWithFallback,
    createListSplitPattern,
    createNumericTypeErrorFormatter,
    describeValueForError,
    describeValueWithArticle,
    ensureMap,
    escapeRegExp,
    getErrorCode,
    getErrorMessage,
    getErrorMessageOrFallback,
    getIdentifierText,
    getNonEmptyTrimmedString,
    getOrCreateMapEntry,
    getObjectTagName,
    callWithFallback,
    identity,
    incrementMapValue,
    isAggregateErrorLike,
    isErrorLike,
    isErrorWithCode,
    isFiniteNumber,
    isFsErrorCode,
    isJsonParseError,
    isNonEmptyArray,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isObjectLike,
    isObjectOrFunction,
    isPathInside,
    JsonParseError,
    mergeUniqueValues,
    noop,
    normalizeEnumeratedOption,
    normalizeExtensionSuffix,
    normalizeIdentifierMetadataEntries,
    normalizeStringList,
    parseJsonObjectWithContext,
    parseJsonWithContext,
    pushUnique,
    resolveContainedRelativePath,
    resolveEnvironmentMap,
    resolveIntegerOption,
    splitLines,
    stringifyJsonForFile,
    formatWithIndefiniteArticle,
    toArray,
    toArrayFromIterable,
    toMutableArray,
    toFiniteNumber,
    toNormalizedInteger,
    toNormalizedLowerCaseSet,
    toNormalizedLowerCaseString,
    toPosixPath,
    toTrimmedString,
    uniqueArray,
    walkAncestorDirectories,
    withObjectLike,
    createVerboseDurationLogger,
    formatDuration,
    timeSync
};

export { Command, InvalidArgumentError, Option } from "commander";

export {
    isMissingModuleDependency,
    resolveModuleDefaultExport
} from "./shared/module.js";

export { ensureDir } from "./shared/ensure-dir.js";

export { createEnumeratedOptionHelpers } from "./shared/enumerated-option-helpers.js";
