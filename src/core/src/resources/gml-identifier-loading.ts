import { createRequire } from "node:module";

import {
    resolveBundledResourcePath,
    resolveBundledResourceUrl
} from "./resource-locator.js";

import { noop } from "../utils/function.js";
import { isObjectLike } from "../utils/object.js";
import { getNonEmptyString } from "../utils/string.js";

const require = createRequire(import.meta.url);

export const GML_IDENTIFIER_METADATA_URL = resolveBundledResourceUrl(
    "gml-identifiers.json"
);

export const GML_IDENTIFIER_METADATA_PATH = resolveBundledResourcePath(
    "gml-identifiers.json"
);

/**
 * Load the bundled identifier metadata JSON artefact.
 *
 * Centralizing path resolution keeps consumers from depending on the
 * repository layout and enables callers to treat the metadata as an injected
 * dependency rather than reaching into package internals.
 *
 * @returns {unknown} Raw identifier metadata payload bundled with the package.
 */
export function loadBundledIdentifierMetadata() {
    return require(GML_IDENTIFIER_METADATA_PATH);
}

/** @type {unknown | null} */
let cachedIdentifierMetadata = null;

/**
 * Retrieve the cached identifier metadata payload.
 *
 * @returns {unknown} Cached identifier metadata payload.
 */
export function getIdentifierMetadata() {
    if (cachedIdentifierMetadata === null) {
        cachedIdentifierMetadata = loadBundledIdentifierMetadata();
    }

    return cachedIdentifierMetadata;
}

/**
 * Reset the metadata cache so test harnesses can force a reload.
 */
export function clearIdentifierMetadataCache() {
    cachedIdentifierMetadata = null;
}

/**
 * Normalize the identifier metadata entries by extracting and validating
 * each entry from the raw payload.
 * @param {*} metadata
 * @returns {Array<{ name: string, type: string, descriptor: object }>}
 */
export function normalizeIdentifierMetadataEntries(metadata) {
    const identifiers =
        metadata && typeof metadata === "object" && metadata.identifiers;

    if (!identifiers || typeof identifiers !== "object") {
        return [];
    }

    return Object.entries(identifiers).reduce((entries, [name, descriptor]) => {
        if (!name) {
            return entries;
        }

        // Descriptor must be a non-null object
        if (!descriptor || typeof descriptor !== "object") {
            return entries;
        }

        const typedDescriptor = descriptor as { type?: unknown };
        const type =
            typeof typedDescriptor.type === "string"
                ? typedDescriptor.type.toLowerCase()
                : "";

        entries.push({ name, type, descriptor });
        return entries;
    }, []);
}

const DEFAULT_EXCLUDED_TYPES = new Set(["literal", "keyword"]);

type ReservedIdentifierMetadataLoader = () => unknown;

let metadataLoader: ReservedIdentifierMetadataLoader =
    defaultLoadIdentifierMetadata;

function safelyLoadIdentifierMetadata(
    loader: ReservedIdentifierMetadataLoader
) {
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
export function setReservedIdentifierMetadataLoader(loader) {
    if (typeof loader !== "function") {
        resetReservedIdentifierMetadataLoader();
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
export function resetReservedIdentifierMetadataLoader() {
    metadataLoader = defaultLoadIdentifierMetadata;
}

function resolveExcludedTypes(types: unknown): Set<string> {
    if (!Array.isArray(types)) {
        return new Set(DEFAULT_EXCLUDED_TYPES);
    }

    const normalized = new Set<string>();
    for (const type of types) {
        const candidate = getNonEmptyString(type);
        if (candidate) {
            normalized.add(candidate.toLowerCase());
        }
    }

    return normalized;
}

export function loadReservedIdentifierNames({
    disallowedTypes
}: { disallowedTypes?: string[] } = {}) {
    const metadata = loadIdentifierMetadata();
    const entries = normalizeIdentifierMetadataEntries(metadata);

    if (entries.length === 0) {
        return new Set<string>();
    }

    const excludedTypes = resolveExcludedTypes(disallowedTypes);
    const names = new Set<string>();

    for (const { name, type } of entries) {
        const normalizedType = getNonEmptyString(type);
        if (normalizedType && excludedTypes.has(normalizedType.toLowerCase())) {
            continue;
        }

        const normalizedName = getNonEmptyString(name);
        if (normalizedName) {
            names.add(normalizedName.toLowerCase());
        }
    }

    return names;
}

/**
 * Load manual function identifiers from the bundled metadata payload.
 *
 * @returns {Set<string>} A set of function names declared in the manual data.
 */
export function loadManualFunctionNames(): Set<string> {
    const metadata = loadIdentifierMetadata();
    const entries = normalizeIdentifierMetadataEntries(metadata);

    if (entries.length === 0) {
        return new Set<string>();
    }

    const names = new Set<string>();

    for (const { name, type } of entries) {
        if (type !== "function" && type !== "unknown") {
            continue;
        }

        const normalizedName = getNonEmptyString(name);
        if (normalizedName) {
            names.add(normalizedName);
        }
    }

    return names;
}
