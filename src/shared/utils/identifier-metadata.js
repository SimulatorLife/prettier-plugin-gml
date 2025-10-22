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
 * @param {unknown} rawName
 * @param {unknown} descriptor
 * @returns {{ name: string, type: string, descriptor: Record<string, unknown> } | null}
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
 * @param {unknown} value
 * @returns {string}
 */
function normalizeIdentifierType(value) {
    return isNonEmptyString(value) ? value.toLowerCase() : "";
}
