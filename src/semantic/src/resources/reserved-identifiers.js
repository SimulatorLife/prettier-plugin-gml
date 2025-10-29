import {
    isObjectLike,
    normalizeIdentifierMetadataEntries,
    noop,
    toNormalizedLowerCaseSet
} from "../shared/index.js";
import {
    GML_IDENTIFIER_METADATA_PATH,
    loadBundledIdentifierMetadata
} from "./bundled-resources.js";

const DEFAULT_EXCLUDED_TYPES = new Set(["literal", "keyword"]);
const DEFAULT_IDENTIFIER_METADATA_PATH = GML_IDENTIFIER_METADATA_PATH;

let metadataLoader = defaultLoadIdentifierMetadata;

function safelyLoadIdentifierMetadata(loader) {
    try {
        const metadata = loader();
        return isObjectLike(metadata) ? metadata : null;
    } catch {
        return null;
    }
}

function defaultLoadIdentifierMetadata() {
    return safelyLoadIdentifierMetadata(loadBundledIdentifierMetadata);
}

function loadIdentifierMetadata() {
    return safelyLoadIdentifierMetadata(metadataLoader);
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
 *          `docs/legacy-identifier-case-plan.md#legacy-architecture-snapshot`; blindly
 *          reinstating `previousLoader` would roll back those newer overrides
 *          and leave the formatter reading stale metadata mid-run.
 */
function setReservedIdentifierMetadataLoader(loader) {
    if (typeof loader !== "function") {
        resetReservedIdentifierMetadataLoader();
        // Callers expect a cleanup handler even when the override is rejected.
        // Advanced integrations wrap `setReservedIdentifierMetadataLoader` in
        // try/finally blocks (documented in
        // docs/reserved-identifier-metadata-hook.md) so their staged metadata
        // only applies during a scoped experiment. Returning the shared `noop`
        // keeps those flows balanced and mirrors other cleanup hooks across the
        // codebase; throwing or returning `null` would explode the finally
        // handler and leave the override logic in an indeterminate state.
        return noop;
    }

    const previousLoader = metadataLoader;
    const wrappedLoader = () => safelyLoadIdentifierMetadata(loader);

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
