import fs from "node:fs";

import { resolveBundledResourcePath, resolveBundledResourceUrl } from "./resource-locator.js";

import { noop } from "../utils/function.js";
import { isObjectLike } from "../utils/object.js";
import { getNonEmptyString } from "../utils/string.js";

export const GML_IDENTIFIER_METADATA_URL = resolveBundledResourceUrl("gml-identifiers.json");

export const GML_IDENTIFIER_METADATA_PATH = resolveBundledResourcePath("gml-identifiers.json");

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
    const contents = fs.readFileSync(GML_IDENTIFIER_METADATA_PATH, "utf8");
    return JSON.parse(contents);
}

/** @type {unknown | null} */
let cachedIdentifierMetadata = null;

/**
 * Cached Set of manual function names to avoid re-allocating on every call.
 * Reset alongside metadata cache to maintain consistency.
 */
let cachedManualFunctionNames: Set<string> | null = null;

/**
 * Cached Map of reserved identifier names keyed by excluded types.
 * Maintains separate caches for different exclusion configurations.
 */
const cachedReservedIdentifierNames = new Map<string, Set<string>>();

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
 * Also clears derived caches (function names, reserved identifiers).
 */
export function clearIdentifierMetadataCache() {
    cachedIdentifierMetadata = null;
    cachedManualFunctionNames = null;
    cachedReservedIdentifierNames.clear();
}

/**
 * Normalize the identifier metadata entries by extracting and validating
 * each entry from the raw payload.
 * @param {*} metadata
 * @returns {Array<{ name: string, type: string, descriptor: object }>}
 */
export function normalizeIdentifierMetadataEntries(metadata) {
    const identifiers = metadata && typeof metadata === "object" && metadata.identifiers;

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
        const type = typeof typedDescriptor.type === "string" ? typedDescriptor.type.toLowerCase() : "";

        entries.push({ name, type, descriptor });
        return entries;
    }, []);
}

const DEFAULT_EXCLUDED_TYPES = new Set(["literal", "keyword"]);

type ReservedIdentifierMetadataLoader = () => unknown;

let metadataLoader: ReservedIdentifierMetadataLoader = defaultLoadIdentifierMetadata;

function safelyLoadIdentifierMetadata(loader: ReservedIdentifierMetadataLoader) {
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

    // Clear caches when the loader changes to prevent stale data
    clearIdentifierMetadataCache();

    return () => {
        if (metadataLoader === wrappedLoader) {
            metadataLoader = previousLoader;
            // Clear caches when restoring to prevent using cached data from the custom loader
            clearIdentifierMetadataCache();
        }
    };
}

/**
 * Restore the reserved identifier metadata loader back to the bundled JSON
 * implementation.
 */
export function resetReservedIdentifierMetadataLoader() {
    metadataLoader = defaultLoadIdentifierMetadata;
    // Clear caches when resetting to ensure fresh data from default loader
    clearIdentifierMetadataCache();
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

/**
 * Generate a stable cache key from excluded types Set.
 * Uses a sorted, joined string representation for consistent lookups.
 */
function createExcludedTypesCacheKey(excludedTypes: Set<string>): string {
    if (excludedTypes.size === 0) {
        return "";
    }

    // Sort only once when creating the cache key
    return Array.from(excludedTypes).toSorted().join(",");
}

export function loadReservedIdentifierNames({ disallowedTypes }: { disallowedTypes?: string[] } = {}) {
    const excludedTypes = resolveExcludedTypes(disallowedTypes);
    const cacheKey = createExcludedTypesCacheKey(excludedTypes);

    // Return cached Set if available
    const cached = cachedReservedIdentifierNames.get(cacheKey);
    if (cached) {
        return cached;
    }

    // Cache miss - compute the Set
    const metadata = loadIdentifierMetadata();
    const entries = normalizeIdentifierMetadataEntries(metadata);

    if (entries.length === 0) {
        const emptySet = new Set<string>();
        cachedReservedIdentifierNames.set(cacheKey, emptySet);
        return emptySet;
    }

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

    // Store in cache and return
    cachedReservedIdentifierNames.set(cacheKey, names);
    return names;
}

/**
 * Load manual function identifiers from the bundled metadata payload.
 *
 * The result is cached to avoid re-allocating the Set on every call.
 * Multiple calls return the same Set instance, reducing memory churn.
 *
 * @returns {Set<string>} A cached set of function names declared in the manual data.
 */
export function loadManualFunctionNames(): Set<string> {
    // Return cached Set if available
    if (cachedManualFunctionNames !== null) {
        return cachedManualFunctionNames;
    }

    // Cache miss - compute the Set
    const metadata = loadIdentifierMetadata();
    const entries = normalizeIdentifierMetadataEntries(metadata);

    if (entries.length === 0) {
        cachedManualFunctionNames = new Set<string>();
        return cachedManualFunctionNames;
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

    // Store in cache and return
    cachedManualFunctionNames = names;
    return cachedManualFunctionNames;
}
