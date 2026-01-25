import {
    type DependentSymbol,
    type FileSymbol,
    type MaybePromise,
    OccurrenceKind,
    type PartialSemanticAnalyzer,
    type SymbolLookupResult,
    type SymbolOccurrence
} from "@gml-modules/refactor";

/**
 * Semantic bridge that adapts @gml-modules/semantic ProjectIndex to the refactor engine.
 */
export class GmlSemanticBridge implements PartialSemanticAnalyzer {
    private projectIndex: any;

    constructor(projectIndex: any) {
        this.projectIndex = projectIndex;
    }

    /**
     * Check if a symbol exists in the project index.
     */
    hasSymbol(symbolId: string): MaybePromise<boolean> {
        return Boolean(this.findSymbolInCollections(symbolId));
    }

    /**
     * Find all occurrences of a symbol by its base name.
     */
    getSymbolOccurrences(symbolName: string): MaybePromise<Array<SymbolOccurrence>> {
        const occurrences: Array<SymbolOccurrence> = [];
        const identifiers = this.projectIndex.identifiers;

        if (!identifiers) {
            return occurrences;
        }

        // Search through all identifier collections
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            if (!collection) continue;

            for (const key of Object.keys(collection)) {
                const entry = collection[key];
                if (entry.name === symbolName) {
                    // Add declarations
                    if (Array.isArray(entry.declarations)) {
                        for (const decl of entry.declarations) {
                            occurrences.push({
                                path: decl.filePath,
                                start: decl.start?.index ?? 0,
                                end: decl.end?.index ?? 0,
                                scopeId: decl.scopeId,
                                kind: OccurrenceKind.DEFINITION
                            });
                        }
                    }

                    // Add references
                    if (Array.isArray(entry.references)) {
                        for (const ref of entry.references) {
                            // References might have location instead of start/end
                            const start = ref.start?.index ?? ref.location?.start?.index ?? 0;
                            const end = ref.end?.index ?? ref.location?.end?.index ?? 0;

                            occurrences.push({
                                path: ref.filePath,
                                start,
                                end,
                                scopeId: ref.scopeId,
                                kind: OccurrenceKind.REFERENCE
                            });
                        }
                    }
                }
            }
        }

        return occurrences;
    }

    /**
     * Get symbols defined in a specific file.
     */
    getFileSymbols(filePath: string): MaybePromise<Array<FileSymbol>> {
        const symbols: Array<FileSymbol> = [];
        const fileRecord = this.projectIndex.files?.[filePath];

        if (fileRecord && Array.isArray(fileRecord.declarations)) {
            // This is a bit complex as we need to map back to symbol IDs
            // For now, we'll return what we can find
            for (const decl of fileRecord.declarations) {
                if (decl.name) {
                    symbols.push({
                        id: decl.identifierId || `gml/unknown/${decl.name}`
                    });
                }
            }
        }

        return symbols;
    }

    /**
     * Get symbols that depend on the given symbols.
     */
    getDependents(symbolIds: Array<string>): MaybePromise<Array<DependentSymbol>> {
        const dependents: Array<DependentSymbol> = [];

        // This requires traversing references in the index
        const identifiers = this.projectIndex.identifiers;
        if (!identifiers) return dependents;

        const symbolIdSet = new Set(symbolIds);

        // We check which symbols reference any of the target symbolNames
        // Note: This is an approximation as ProjectIndex might not have perfect symbolId-to-symbolId mapping yet
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            for (const key of Object.keys(collection)) {
                const entry = collection[key];

                // If this entry references any of our target symbols
                if (Array.isArray(entry.references)) {
                    for (const ref of entry.references) {
                        if (
                            symbolIdSet.has(ref.targetSymbolId) ||
                            (ref.targetName && this.testNameMatch(symbolIdSet, ref.targetName))
                        ) {
                            dependents.push({
                                symbolId: entry.identifierId || key,
                                filePath: entry.resourcePath || ""
                            });
                            break;
                        }
                    }
                }
            }
        }

        return dependents;
    }

    /**
     * Perform a scope-aware lookup for a name.
     */
    lookup(name: string, scopeId?: string): MaybePromise<SymbolLookupResult | null> {
        // Basic implementation: find if name exists in the requested scope or globally
        const identifiers = this.projectIndex.identifiers;
        if (!identifiers) return null;

        // Check if it exists in any collection
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            for (const key of Object.keys(collection)) {
                const entry = collection[key];
                if (
                    entry.name === name && // If scopeId matches or is global
                    (!scopeId || entry.scopeId === scopeId)
                ) {
                    return { name: entry.name };
                }
            }
        }

        return null;
    }

    private findSymbolInCollections(symbolId: string): any {
        const identifiers = this.projectIndex.identifiers;
        if (!identifiers) return null;

        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            if (collection[symbolId]) return collection[symbolId];

            // Also try searching by identifierId property
            for (const key of Object.keys(collection)) {
                if (collection[key].identifierId === symbolId) return collection[key];
            }
        }
        return null;
    }

    private testNameMatch(symbolIds: Set<string>, name: string): boolean {
        for (const id of symbolIds) {
            if (id.endsWith(`/${name}`)) return true;
        }
        return false;
    }
}
