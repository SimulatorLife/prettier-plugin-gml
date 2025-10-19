import { createRequire } from "node:module";

import {
    isNonEmptyString,
    toNormalizedLowerCaseSet
} from "../../shared/string-utils.js";
import { isObjectLike } from "../../shared/object-utils.js";

const require = createRequire(import.meta.url);

const DEFAULT_EXCLUDED_TYPES = new Set(["literal", "keyword"]);

function loadIdentifierMetadata() {
    try {
        const metadata = require("../../../resources/gml-identifiers.json");
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
    const identifiers = metadata?.identifiers;

    if (!isObjectLike(identifiers)) {
        return new Set();
    }

    const excludedTypes = resolveExcludedTypes(disallowedTypes);

    return Object.entries(identifiers).reduce(
        (names, [name, info]) =>
            addIdentifierWhenAllowed(names, name, info, excludedTypes),
        new Set()
    );
}

function addIdentifierWhenAllowed(names, rawName, info, excludedTypes) {
    if (!isNonEmptyString(rawName)) {
        return names;
    }

    const normalizedType = normalizeIdentifierType(info);
    if (excludedTypes.has(normalizedType)) {
        return names;
    }

    names.add(rawName.toLowerCase());
    return names;
}

function normalizeIdentifierType(info) {
    return typeof info?.type === "string" ? info.type.toLowerCase() : "";
}
