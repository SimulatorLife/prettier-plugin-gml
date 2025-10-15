import { createRequire } from "node:module";

import { isNonEmptyString } from "./string-utils.js";

const require = createRequire(import.meta.url);

const DEFAULT_DISALLOWED_IDENTIFIER_TYPES = Object.freeze([
    "literal",
    "keyword"
]);

function loadIdentifierMetadata() {
    try {
        const metadata = require("../../resources/gml-identifiers.json");
        return metadata && typeof metadata === "object" ? metadata : null;
    } catch {
        return null;
    }
}

function normalizeTypeList(types) {
    if (!Array.isArray(types)) {
        return new Set(DEFAULT_DISALLOWED_IDENTIFIER_TYPES);
    }

    const normalized = new Set();

    for (const entry of types) {
        if (!isNonEmptyString(entry)) {
            continue;
        }

        normalized.add(entry.toLowerCase());
    }

    return normalized;
}

export function loadReservedIdentifierNames({ disallowedTypes } = {}) {
    const metadata = loadIdentifierMetadata();
    const identifiers = metadata?.identifiers;

    if (!identifiers || typeof identifiers !== "object") {
        return new Set();
    }

    const excludedTypes = normalizeTypeList(disallowedTypes);
    const names = new Set();

    for (const [name, info] of Object.entries(identifiers)) {
        if (!isNonEmptyString(name)) {
            continue;
        }

        const type =
            typeof info?.type === "string" ? info.type.toLowerCase() : "";
        if (excludedTypes.has(type)) {
            continue;
        }

        names.add(name.toLowerCase());
    }

    return names;
}
