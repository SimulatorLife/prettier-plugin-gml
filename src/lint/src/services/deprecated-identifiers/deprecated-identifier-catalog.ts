import * as CoreWorkspace from "@gmloop/core";

const { Core } = CoreWorkspace;

/**
 * Normalized deprecated identifier metadata used by lint rules.
 */
export type DeprecatedIdentifierCatalogEntry = Readonly<{
    name: string;
    normalizedName: string;
    type: string;
    replacement: string | null;
    replacementKind: CoreWorkspace.DeprecatedIdentifierReplacementKind;
    legacyCategory: string | null;
    legacyUsage: CoreWorkspace.DeprecatedIdentifierLegacyUsage;
    diagnosticOwner: CoreWorkspace.DeprecatedIdentifierDiagnosticOwner | null;
}>;

/**
 * Cached lookup structure for deprecated identifier metadata.
 */
export type DeprecatedIdentifierCatalog = Readonly<{
    byNormalizedName: ReadonlyMap<string, DeprecatedIdentifierCatalogEntry>;
}>;

let cachedDeprecatedIdentifierCatalog: DeprecatedIdentifierCatalog | null = null;

function createCatalogEntry(entry: CoreWorkspace.DeprecatedIdentifierMetadataEntry): DeprecatedIdentifierCatalogEntry {
    return Object.freeze({
        name: entry.name,
        normalizedName: entry.name.toLowerCase(),
        type: entry.type,
        replacement: entry.replacement,
        replacementKind: entry.replacementKind,
        legacyCategory: entry.legacyCategory,
        legacyUsage: entry.legacyUsage,
        diagnosticOwner: entry.diagnosticOwner
    });
}

/**
 * Load the cached deprecated identifier catalog used by lint rules.
 *
 * The catalog is intentionally lint-local so rule implementations share a
 * consistent view of deprecation ownership and safe direct replacements.
 */
export function loadDeprecatedIdentifierCatalog(): DeprecatedIdentifierCatalog {
    if (cachedDeprecatedIdentifierCatalog !== null) {
        return cachedDeprecatedIdentifierCatalog;
    }

    const byNormalizedName = new Map<string, DeprecatedIdentifierCatalogEntry>();
    for (const entry of Core.loadDeprecatedIdentifierEntries()) {
        const catalogEntry = createCatalogEntry(entry);
        byNormalizedName.set(catalogEntry.normalizedName, catalogEntry);
    }

    cachedDeprecatedIdentifierCatalog = Object.freeze({
        byNormalizedName: byNormalizedName as ReadonlyMap<string, DeprecatedIdentifierCatalogEntry>
    });
    return cachedDeprecatedIdentifierCatalog;
}

/**
 * Clear the deprecated identifier catalog cache.
 *
 * Tests use this alongside `Core.clearIdentifierMetadataCache()` when they
 * swap in synthetic metadata payloads.
 */
export function clearDeprecatedIdentifierCatalogCache(): void {
    cachedDeprecatedIdentifierCatalog = null;
}

/**
 * Resolve a deprecated identifier entry by normalized identifier name.
 */
export function getDeprecatedIdentifierCatalogEntry(identifierName: string): DeprecatedIdentifierCatalogEntry | null {
    if (identifierName.trim().length === 0) {
        return null;
    }

    return loadDeprecatedIdentifierCatalog().byNormalizedName.get(identifierName.toLowerCase()) ?? null;
}
