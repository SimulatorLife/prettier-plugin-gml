/**
 * Facade exposing the shared helpers consumed by the semantic package.
 * Narrowing the export surface avoids the previous "export everything" coupling
 * that made it difficult to reason about which utilities project-index modules
 * actually relied on.
 */
export {
    assertArray,
    asArray,
    isNonEmptyArray,
    mergeUniqueValues,
    pushUnique,
    toArray,
    toArrayFromIterable,
    toMutableArray
} from "@gml-modules/core";
export {
    areNumbersApproximatelyEqual,
    isFiniteNumber,
    toFiniteNumber
} from "@gml-modules/core";
export {
    assertFunction,
    getOrCreateMapEntry,
    hasOwn,
    isObjectLike,
    isPlainObject,
    withDefinedValue
} from "@gml-modules/core";
export { assignClonedLocation, cloneLocation } from "@gml-modules/core";
export { buildFileLocationKey, buildLocationKey } from "@gml-modules/core";
export { getCallExpressionIdentifier } from "@gml-modules/core";
export { createAbortGuard, throwIfAborted } from "@gml-modules/core";
export {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback,
    resolveEnvironmentMap
} from "@gml-modules/core";
export { createMetricsTracker } from "@gml-modules/core";
export { noop } from "@gml-modules/core";
export {
    describeValueForError,
    getNonEmptyString,
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    normalizeExtensionSuffix,
    isWordChar,
    toNormalizedLowerCaseSet,
    toTrimmedString
} from "@gml-modules/core";
export { isJsonParseError, parseJsonWithContext } from "@gml-modules/core";
export { getLineBreakSpans, splitLines } from "@gml-modules/core";
export { isFsErrorCode } from "@gml-modules/core";
export {
    resolveContainedRelativePath,
    toPosixPath,
    walkAncestorDirectories
} from "@gml-modules/core";
export { normalizeIdentifierMetadataEntries } from "@gml-modules/core";

/**
 * @typedef {object} GameMakerAstLocation
 * @property {number | null | undefined} [line]
 * @property {number | null | undefined} [index]
 */

/**
 * @typedef {object} GameMakerAstNode
 * @property {string | null | undefined} [type]
 * @property {GameMakerAstLocation | null | undefined} [start]
 * @property {GameMakerAstLocation | null | undefined} [end]
 * @property {unknown} [object]
 * @property {unknown} [property]
 * @property {Array<unknown> | null | undefined} [arguments]
 * @property {Array<unknown> | null | undefined} [body]
 */

/**
 * Placeholder export so consumers can continue to reference
 * `import("../dependencies.js").GameMakerAstNode` in JSDoc comments.
 * @type {GameMakerAstNode | null}
 */
export const GameMakerAstNode = null;
