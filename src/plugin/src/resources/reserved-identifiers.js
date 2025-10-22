import { toNormalizedLowerCaseSet } from "../shared/string-utils.js";
import { normalizeIdentifierMetadataEntries } from "../shared/identifier-metadata.js";
import { loadGmlIdentifierMetadata } from "./gml-identifiers-metadata.js";

const DEFAULT_EXCLUDED_TYPES = new Set(["literal", "keyword"]);

function resolveExcludedTypes(types) {
    if (!Array.isArray(types)) {
        return new Set(DEFAULT_EXCLUDED_TYPES);
    }

    return toNormalizedLowerCaseSet(types);
}

export function loadReservedIdentifierNames({ disallowedTypes } = {}) {
    const metadata = loadGmlIdentifierMetadata();
    const entries = normalizeIdentifierMetadataEntries(metadata);

    if (entries.length === 0) {
        return new Set();
    }

    const excludedTypes = resolveExcludedTypes(disallowedTypes);
    const names = new Set();

    for (const { name, type } of entries) {
        if (excludedTypes.has(type)) {
            continue;
        }

        names.add(name.toLowerCase());
    }

    return names;
}
