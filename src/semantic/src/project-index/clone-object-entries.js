import { isNonEmptyArray } from "../dependencies.js";

/**
 * Create shallow clones of object-like entries in an array.
 *
 * Project-index serialization frequently clones resource metadata before
 * writing cache artefacts so callers can safely mutate the returned entries
 * without mutating shared state. Centralizing the cloning logic within the
 * project-index layer keeps the shared array helpers focused on generic data
 * structures while preserving the lightweight defensive guards the indexer
 * relied on previously.
 *
 * @template T
 * @param {Array<T> | null | undefined} entries Collection of entries to clone.
 * @returns {Array<T>} Array containing shallow clones of object entries.
 */
export function cloneObjectEntries(entries) {
    if (!isNonEmptyArray(entries)) {
        return [];
    }

    return entries.map((entry) =>
        entry && typeof entry === "object" ? { ...entry } : entry
    );
}
