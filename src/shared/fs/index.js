import { isErrorWithCode } from "../utils/error.js";

/**
 * Type-safe wrapper over {@link isErrorWithCode} so callers can narrow thrown
 * filesystem errors to specific Node-style `code` strings without repeating the
 * shared utility import. Accepts the same loose inputs as the underlying
 * helper, mirroring how error guards are typically used in catch blocks.
 *
 * @param {unknown} error Candidate error thrown by the filesystem facade.
 * @param {...string} codes Node-style error codes (for example `"ENOENT"`).
 * @returns {error is NodeJS.ErrnoException} `true` when {@link error} exposes a
 *          matching {@link NodeJS.ErrnoException.code} value.
 */
export function isFsErrorCode(error, ...codes) {
    return isErrorWithCode(error, ...codes);
}
