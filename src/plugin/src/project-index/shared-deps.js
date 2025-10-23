// Facade consolidating shared utilities for project-index modules.
// Centralizing these re-exports keeps callers from depending on deep
// relative paths into the shared implementation tree.
export {
    createAbortGuard,
    throwIfAborted
} from "../../../shared/abort-utils.js";
export {
    asArray,
    cloneObjectEntries,
    isNonEmptyArray
} from "../../../shared/array-utils.js";
export { cloneLocation } from "../../../shared/ast-locations.js";
export { getCallExpressionIdentifier } from "../../../shared/ast-node-helpers.js";
export { createEnvConfiguredValue } from "../../../shared/environment-utils.js";
export {
    isFsErrorCode,
    listDirectory,
    getFileMtime
} from "../../../shared/fs-utils.js";
export { normalizeIdentifierMetadataEntries } from "../../../shared/identifier-metadata.js";
export {
    buildFileLocationKey,
    buildLocationKey
} from "../../../shared/location-keys.js";
export {
    areNumbersApproximatelyEqual,
    isFiniteNumber
} from "../../../shared/number-utils.js";
export {
    isJsonParseError,
    parseJsonWithContext
} from "../../../shared/json-utils.js";
export {
    assertFunction,
    getOrCreateMapEntry,
    hasOwn,
    isObjectLike,
    isPlainObject
} from "../../../shared/object-utils.js";
export {
    resolveContainedRelativePath,
    toPosixPath,
    walkAncestorDirectories
} from "../../../shared/path-utils.js";
export {
    isNonEmptyString,
    isNonEmptyTrimmedString,
    getNonEmptyString
} from "../../../shared/string-utils.js";
export { splitLines } from "../../../shared/line-breaks.js";
