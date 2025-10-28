/**
 * Facade exposing the shared helpers consumed by the semantic package.
 * Narrowing the export surface avoids the previous "export everything" coupling
 * that made it difficult to reason about which utilities project-index modules
 * actually relied on.
 */
export {
    asArray,
    isNonEmptyArray,
    pushUnique,
    toArray,
    toArrayFromIterable
} from "@prettier-plugin-gml/shared/utils/array.js";
export {
    areNumbersApproximatelyEqual,
    isFiniteNumber
} from "@prettier-plugin-gml/shared/utils/number.js";
export {
    assertFunction,
    getOrCreateMapEntry,
    hasOwn,
    isObjectLike,
    isPlainObject,
    withDefinedValue
} from "@prettier-plugin-gml/shared/utils/object.js";
export {
    assignClonedLocation,
    cloneLocation
} from "@prettier-plugin-gml/shared/ast/locations.js";
export {
    buildFileLocationKey,
    buildLocationKey
} from "@prettier-plugin-gml/shared/ast/location-keys.js";
export { getCallExpressionIdentifier } from "@prettier-plugin-gml/shared/ast/node-helpers.js";
export {
    createAbortGuard,
    throwIfAborted
} from "@prettier-plugin-gml/shared/utils/abort.js";
export {
    createEnvConfiguredValueWithFallback,
    resolveEnvironmentMap
} from "@prettier-plugin-gml/shared/utils/environment.js";
export { createMetricsTracker } from "@prettier-plugin-gml/shared/reporting/metrics.js";
export { noop } from "@prettier-plugin-gml/shared/utils/function.js";
export {
    getNonEmptyString,
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isWordChar,
    toTrimmedString
} from "@prettier-plugin-gml/shared/utils/string.js";
export {
    isJsonParseError,
    parseJsonWithContext
} from "@prettier-plugin-gml/shared/utils/json.js";
export {
    getLineBreakSpans,
    splitLines
} from "@prettier-plugin-gml/shared/utils/line-breaks.js";
export { isFsErrorCode } from "@prettier-plugin-gml/shared/fs/index.js";
export {
    resolveContainedRelativePath,
    toPosixPath,
    walkAncestorDirectories
} from "@prettier-plugin-gml/shared/fs/path.js";
export { normalizeIdentifierMetadataEntries } from "@prettier-plugin-gml/shared/identifier-metadata/index.js";

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
