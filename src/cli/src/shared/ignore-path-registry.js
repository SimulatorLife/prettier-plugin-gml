import { isNonEmptyString } from "./dependencies.js";

const registeredIgnorePaths = new Set();

/**
 * Determine whether the provided path has already been registered.
 *
 * Guards against invalid input so callers can pass optional CLI values without
 * manually checking types.
 *
 * @param {string | null | undefined} ignorePath Candidate ignore path value.
 * @returns {boolean} `true` when the path has been seen before.
 */
export function hasRegisteredIgnorePath(ignorePath) {
    if (!isNonEmptyString(ignorePath)) {
        return false;
    }
    return registeredIgnorePaths.has(ignorePath);
}

/**
 * Track a path that should be respected by CLI commands invoking Prettier.
 *
 * Invalid or empty values are ignored to keep registration call sites concise.
 *
 * @param {string | null | undefined} ignorePath Path to record as an active
 *        ignore entry.
 */
export function registerIgnorePath(ignorePath) {
    if (!isNonEmptyString(ignorePath)) {
        return;
    }
    registeredIgnorePaths.add(ignorePath);
}

/**
 * Remove all previously registered ignore paths.
 */
export function resetRegisteredIgnorePaths() {
    registeredIgnorePaths.clear();
}
