import { createRequire } from "node:module";

import { toNormalizedLowerCaseSet } from "../../../shared/string-utils.js";
import { normalizeIdentifierMetadataEntries } from "../../../shared/identifier-metadata.js";

const require = createRequire(import.meta.url);

const DEFAULT_EXCLUDED_TYPES = new Set(["literal", "keyword"]);

function loadIdentifierMetadata() {
    try {
        const metadata = require("../../../../resources/gml-identifiers.json");
        return metadata && typeof metadata === "object" ? metadata : null;
    } catch {
        return null;
    }
}

function resolveExcludedTypes(types) {
    if (!Array.isArray(types)) {
        return new Set(DEFAULT_EXCLUDED_TYPES);
    }

    return toNormalizedLowerCaseSet(types);
}

export function loadReservedIdentifierNames({ disallowedTypes } = {}) {
    const metadata = loadIdentifierMetadata();
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
