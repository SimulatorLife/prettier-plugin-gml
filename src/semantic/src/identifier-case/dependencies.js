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
} from "@prettier-plugin-gml/shared/utils/array.js";
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
} from "@prettier-plugin-gml/shared/utils/string.js";
export {
    assertFunction,
    assertPlainObject,
    coalesceOption,
    getOrCreateMapEntry,
    incrementMapValue,
    isObjectLike,
    withDefinedValue,
    withObjectLike
} from "@prettier-plugin-gml/shared/utils/object.js";
export { isFiniteNumber } from "@prettier-plugin-gml/shared/utils/number.js";
export {
    coerceNonNegativeInteger,
    coercePositiveInteger,
    normalizeNumericOption
} from "@prettier-plugin-gml/shared/utils/numeric-options.js";
export {
    getIterableSize,
    isMapLike
} from "@prettier-plugin-gml/shared/utils/capability-probes.js";
export {
    parseJsonWithContext,
    stringifyJsonForFile
} from "@prettier-plugin-gml/shared/utils/json.js";
export {
    getErrorMessage,
    getErrorMessageOrFallback
} from "@prettier-plugin-gml/shared/utils/error.js";
export { escapeRegExp } from "@prettier-plugin-gml/shared/utils/regexp.js";
export { noop } from "@prettier-plugin-gml/shared/utils/function.js";
export {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback
} from "@prettier-plugin-gml/shared/utils/environment.js";
export { createMetricsTracker } from "@prettier-plugin-gml/shared/reporting/metrics.js";
export { isFsErrorCode } from "@prettier-plugin-gml/shared/fs/index.js";
export { fromPosixPath } from "@prettier-plugin-gml/shared/fs/path.js";
export { buildLocationKey } from "@prettier-plugin-gml/shared/ast/location-keys.js";

export { GameMakerAstNode } from "../dependencies.js";
