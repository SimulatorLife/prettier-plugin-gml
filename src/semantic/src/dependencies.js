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
} from "../../shared/utils/array.js";
export {
    areNumbersApproximatelyEqual,
    isFiniteNumber
} from "../../shared/utils/number.js";
export {
    assertFunction,
    getOrCreateMapEntry,
    hasOwn,
    isObjectLike,
    isPlainObject,
    withDefinedValue
} from "../../shared/utils/object.js";
export {
    assignClonedLocation,
    cloneLocation
} from "../../shared/ast/locations.js";
export {
    buildFileLocationKey,
    buildLocationKey
} from "../../shared/ast/location-keys.js";
export { getCallExpressionIdentifier } from "../../shared/ast/node-helpers.js";
export { createAbortGuard, throwIfAborted } from "../../shared/utils/abort.js";
export {
    createEnvConfiguredValueWithFallback,
    resolveEnvironmentMap
} from "../../shared/utils/environment.js";
export { createMetricsTracker } from "../../shared/reporting/metrics.js";
export { noop } from "../../shared/utils/function.js";
export {
    getNonEmptyString,
    getNonEmptyTrimmedString,
    isNonEmptyString,
    isNonEmptyTrimmedString
} from "../../shared/utils/string.js";
export {
    isJsonParseError,
    parseJsonWithContext
} from "../../shared/utils/json.js";
export { splitLines } from "../../shared/utils/line-breaks.js";
export { isFsErrorCode } from "../../shared/fs/index.js";
export {
    resolveContainedRelativePath,
    toPosixPath,
    walkAncestorDirectories
} from "../../shared/fs/path.js";
export { normalizeIdentifierMetadataEntries } from "../../shared/identifier-metadata/index.js";

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
