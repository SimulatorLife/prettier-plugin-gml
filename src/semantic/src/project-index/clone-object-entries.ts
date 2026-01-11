import { Core } from "@gml-modules/core";

/**
 * @deprecated Use Core.cloneObjectEntries instead. This re-export exists only
 * for backward compatibility during the transition.
 *
 * @template T
 * @param {Array<T> | null | undefined} entries Collection of entries to clone.
 * @returns {Array<T>} Array containing shallow clones of object entries.
 */
export function cloneObjectEntries(entries?) {
    return Core.cloneObjectEntries(entries);
}
