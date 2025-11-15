/**
 * Facade exposing the shared helpers consumed by identifier-case modules.
 *
 * Consolidating the re-exports in this directory keeps identifier-case logic
 * decoupled from the entire shared package surface. Modules can depend on a
 * curated set of utilities without reaching through the legacy `../shared`
 * barrel that previously forwarded every helper.
 */
export {
    asArray,
    compactArray,
    isNonEmptyArray,
    toArray,
    toArrayFromIterable
} from "@gml-modules/core";
export {
    capitalize,
    coalesceTrimmedString,
    createListSplitPattern,
    getNonEmptyString,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    normalizeStringList,
    toNormalizedLowerCaseString,
    trimStringEntries
} from "@gml-modules/core";
export {
    assertFunction,
    assertPlainObject,
    coalesceOption,
    getOrCreateMapEntry,
    incrementMapValue,
    isObjectLike,
    withDefinedValue,
    withObjectLike
} from "@gml-modules/core";
export { isFiniteNumber, toFiniteNumber } from "@gml-modules/core";
export {
    coerceNonNegativeInteger,
    coercePositiveInteger,
    normalizeNumericOption
} from "@gml-modules/core";
export { getIterableSize, isMapLike } from "@gml-modules/core";
export { parseJsonWithContext, stringifyJsonForFile } from "@gml-modules/core";
export { getErrorMessage, getErrorMessageOrFallback } from "@gml-modules/core";
export { escapeRegExp } from "@gml-modules/core";
export { noop } from "@gml-modules/core";
export {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback
} from "@gml-modules/core";
export { createMetricsTracker } from "@gml-modules/core";
export { isFsErrorCode } from "@gml-modules/core";
export { fromPosixPath } from "@gml-modules/core";
export { buildLocationKey } from "@gml-modules/core";

export { GameMakerAstNode } from "../dependencies.js";
