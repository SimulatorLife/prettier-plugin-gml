import { isObjectLike } from "./object.js";
import { isNonEmptyString } from "./string.js";

/**
 * Normalize identifier metadata entries into a consistent shape callers can
 * safely consume. Invalid or malformed entries are discarded so downstream
 * modules can focus on business logic instead of defensive checks.
 *
 * @param {unknown} metadata Identifier metadata payload containing an
 *        `identifiers` record.
 * @returns {Array<{ name: string, type: string, descriptor: Record<string, unknown> }>}
 */
export function normalizeIdentifierMetadataEntries(metadata) {
    if (!isObjectLike(metadata)) {
        return [];
    }

    const { identifiers } = metadata;
    if (!isObjectLike(identifiers)) {
        return [];
    }

    const entries = [];

    for (const [rawName, descriptor] of Object.entries(identifiers)) {
        const normalized = normalizeIdentifierMetadataEntry(
            rawName,
            descriptor
        );
        if (normalized) {
            entries.push(normalized);
        }
    }

    return entries;
}

/**
 * Convert a raw identifier metadata entry into the normalized shape consumed
 * by {@link normalizeIdentifierMetadataEntries}. Invalid names or descriptors
 * are discarded so the caller can simply filter out `null` results instead of
 * repeating defensive checks at each call site.
 *
 * @param {unknown} rawName Raw key from the `identifiers` record.
 * @param {unknown} descriptor Candidate metadata descriptor containing the
 *        identifier `type` and any additional fields.
 * @returns {{ name: string, type: string, descriptor: Record<string, unknown> } | null}
 *          Normalized identifier metadata when both inputs are valid,
 *          otherwise `null` to signal the entry should be ignored.
 */
function normalizeIdentifierMetadataEntry(rawName, descriptor) {
    if (!isNonEmptyString(rawName)) {
        return null;
    }

    if (!isObjectLike(descriptor)) {
        return null;
    }

    return {
        name: rawName,
        type: normalizeIdentifierType(descriptor.type),
        descriptor
    };
}

/**
 * Normalize a raw identifier `type` value. Non-empty strings are coerced to
 * lowercase so casing differences in user-supplied metadata do not produce
 * distinct variants. Invalid inputs fallback to an empty string which keeps
 * downstream consumers from handling `null` or `undefined`.
 *
 * @param {unknown} value Candidate type value from an identifier descriptor.
 * @returns {string} Lowercase identifier type or an empty string when the
 *          value is missing or not a string.
 */
function normalizeIdentifierType(value) {
    return isNonEmptyString(value) ? value.toLowerCase() : "";
}
