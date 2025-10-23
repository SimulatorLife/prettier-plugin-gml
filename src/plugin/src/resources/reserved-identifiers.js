import { createRequire } from "node:module";

import { toNormalizedLowerCaseSet } from "../../../shared/string-utils.js";
import { normalizeIdentifierMetadataEntries } from "../../../shared/identifier-metadata.js";

const require = createRequire(import.meta.url);

const DEFAULT_EXCLUDED_TYPES = new Set(["literal", "keyword"]);
const DEFAULT_IDENTIFIER_METADATA_PATH =
    "../../../../resources/gml-identifiers.json";

let metadataLoader = defaultLoadIdentifierMetadata;

function defaultLoadIdentifierMetadata() {
    try {
        const metadata = require(DEFAULT_IDENTIFIER_METADATA_PATH);
        return metadata && typeof metadata === "object" ? metadata : null;
    } catch {
        return null;
    }
}

function loadIdentifierMetadata() {
    try {
        const metadata = metadataLoader();
        return metadata && typeof metadata === "object" ? metadata : null;
    } catch {
        return null;
    }
}

/**
 * Allow advanced integrations to supply alternate metadata at runtime while
 * keeping the default loader pointed at the bundled JSON file.
 *
 * @param {() => unknown} loader
 * @returns {() => void} Cleanup handler that restores the previous loader when
 *          invoked. The handler intentionally degrades to a no-op when another
 *          caller swapped the loader before cleanup runs. Identifier casing
 *          integrations layer overrides during try/finally flows described in
 *          `docs/naming-conventions.md#objective-and-constraints`; blindly
 *          reinstating `previousLoader` would roll back those newer overrides
 *          and leave the formatter reading stale metadata mid-run.
 */
function setReservedIdentifierMetadataLoader(loader) {
    if (typeof loader !== "function") {
        resetReservedIdentifierMetadataLoader();
        return () => {};
    }

    const previousLoader = metadataLoader;
    const wrappedLoader = () => loader();

    metadataLoader = wrappedLoader;

    return () => {
        if (metadataLoader === wrappedLoader) {
            metadataLoader = previousLoader;
        }
    };
}

/**
 * Restore the reserved identifier metadata loader back to the bundled JSON
 * implementation.
 */
function resetReservedIdentifierMetadataLoader() {
    metadataLoader = defaultLoadIdentifierMetadata;
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

export {
    DEFAULT_IDENTIFIER_METADATA_PATH,
    resetReservedIdentifierMetadataLoader,
    setReservedIdentifierMetadataLoader
};
