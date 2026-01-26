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
    hasSymbol(symbolId: string): boolean {
        return Boolean(this.findSymbolInCollections(symbolId));
    }

    /**
     * Try to find the most appropriate symbol ID for a given name.
     * Searches all collections and returns a SCIP-style symbol ID.
     */
    resolveSymbolId(name: string): string | null {
        const identifiers = this.projectIndex.identifiers;
        if (!identifiers) return null;

        // Search collections in priority order
        const priorityCollections = [
            "scripts",
            "macros",
            "globalVariables",
            "enums",
            "enumMembers",
            "instanceVariables"
        ];

        for (const collectionName of priorityCollections) {
            const collection = identifiers[collectionName];
            if (!collection) continue;

            for (const key of Object.keys(collection)) {
                const entry = collection[key];

                // Check if entry itself matches
                if (entry.name === name) {
                    return this.generateScipId(entry);
                }

                // Check for nested declarations
                if (Array.isArray(entry.declarations)) {
                    for (const decl of entry.declarations) {
                        if (decl.name === name) {
                            return this.generateScipId(entry, name);
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Find all occurrences of a symbol by its base name.
     */
    getSymbolOccurrences(symbolName: string): Array<SymbolOccurrence> {
        const occurrences: Array<SymbolOccurrence> = [];
        const identifiers = this.projectIndex.identifiers;

        if (!identifiers) {
            return occurrences;
        }

        // 1. Search through all identifier collections in the index
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            if (!collection) continue;

            for (const key of Object.keys(collection)) {
                this.collectOccurrencesFromEntry(collection[key], symbolName, occurrences);
            }
        }

        // 2. Search through general relationships for any script calls that matched the name
        // but weren't resolved to a specific identifier entry (useful for modern GML functions)
        this.collectOccurrencesFromRelationships(symbolName, occurrences);

        return this.deduplicateOccurrences(occurrences);
    }

    /**
     * Collect occurrences from a specific index entry.
     */
    private collectOccurrencesFromEntry(entry: any, symbolName: string, occurrences: Array<SymbolOccurrence>): void {
        // Case A: The entry name itself matches (e.g. macro name, enum name, or script resource name)
        if (entry.name === symbolName) {
            this.collectAllFromEntry(entry, occurrences);
            return;
        }

        // Case B: The entry name differs but it contains a declaration with the target name
        // (e.g. a script file containing multiple named functions)
        if (Array.isArray(entry.declarations)) {
            for (const decl of entry.declarations) {
                if (decl.name === symbolName) {
                    occurrences.push({
                        path: decl.filePath,
                        start: decl.start?.index ?? 0,
                        end: decl.end?.index ?? 0,
                        scopeId: decl.scopeId,
                        kind: OccurrenceKind.DEFINITION
                    });
                }
            }
        }

        // Case C: The entry has references that match the target name
        if (Array.isArray(entry.references)) {
            for (const ref of entry.references) {
                if (ref.targetName === symbolName) {
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

    /**
     * Collect occurrences from project relationships (script calls).
     */
    private collectOccurrencesFromRelationships(symbolName: string, occurrences: Array<SymbolOccurrence>): void {
        const scriptCalls = this.projectIndex.relationships?.scriptCalls;
        if (!Array.isArray(scriptCalls)) {
            return;
        }

        for (const call of scriptCalls) {
            if (call.target?.name === symbolName) {
                const start = call.location?.start?.index ?? 0;
                const end = call.location?.end?.index ?? 0;

                occurrences.push({
                    path: call.from?.filePath ?? "",
                    start,
                    end,
                    scopeId: call.from?.scopeId,
                    kind: OccurrenceKind.REFERENCE
                });
            }
        }
    }

    /**
     * Collect all declarations and references from an entry into the occurrences array.
     */
    private collectAllFromEntry(entry: any, occurrences: Array<SymbolOccurrence>): void {
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

    /**
     * Deduplicate occurrences by path and range.
     */
    private deduplicateOccurrences(occurrences: Array<SymbolOccurrence>): Array<SymbolOccurrence> {
        const seen = new Set<string>();
        return occurrences.filter((occ) => {
            const key = `${occ.path}:${occ.start}:${occ.end}:${occ.kind}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
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
        const identifiers = this.projectIndex.identifiers ?? this.projectIndex.identifierCollections;
        if (!identifiers) return null;

        // 1. Direct match by key or identifierId (fast path)
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            if (collection[symbolId]) return collection[symbolId];

            // Also try searching by identifierId property
            for (const key of Object.keys(collection)) {
                const entry = collection[key];
                if (entry.identifierId === symbolId) return entry;
            }
        }

        // 2. Map SCIP-style ID to internal indexer ID and try again
        const scipMatch = symbolId.match(/^gml\/([^/]+)\/(.+)$/);
        if (scipMatch) {
            const kind = scipMatch[1];
            const name = scipMatch[2];
            const indexerKind = this.mapToIndexerKind(kind);
            const indexerId = `${indexerKind}:${name}`;

            for (const collectionName of Object.keys(identifiers)) {
                const collection = identifiers[collectionName];
                for (const key of Object.keys(collection)) {
                    const entry = collection[key];
                    if (entry.identifierId === indexerId) return entry;
                }
            }

            // 3. Search deeper for nested symbols using the name from SCIP ID
            // We search in ALL collections that might contain these declarations
            for (const collectionName of Object.keys(identifiers)) {
                const collection = identifiers[collectionName];
                const entry = this.findMatchingEntryInCollection(collection, name);
                if (entry) return entry;
            }
        }

        return null;
    }

    private mapToIndexerKind(scipKind: string): string {
        switch (scipKind) {
            case "script": {
                return "script";
            }
            case "macro": {
                return "macro";
            }
            case "enum": {
                return "enum";
            }
            case "var": {
                return "global"; // Default for generic var in SCIP scale
            }
            default: {
                return scipKind;
            }
        }
    }

    private generateScipId(entry: any, nestedName?: string): string {
        const name = nestedName ?? entry.name;
        let scipKind = "var";

        // Infer SCIP kind from identifierId or entry metadata
        const id = entry.identifierId ?? "";
        if (id.startsWith("script:")) {
            scipKind = "script";
        } else if (id.startsWith("macro:")) {
            scipKind = "macro";
        } else if (id.startsWith("enum:")) {
            scipKind = "enum";
        } else if (id.startsWith("global:") || id.startsWith("instance:")) {
            scipKind = "var";
        }

        return `gml/${scipKind}/${name}`;
    }

    /**
     * Search for an entry in a collection that contains a declaration with the given name.
     */
    private findMatchingEntryInCollection(collection: any, name: string): any {
        for (const key of Object.keys(collection)) {
            const entry = collection[key];
            if (Array.isArray(entry.declarations)) {
                for (const decl of entry.declarations) {
                    if (decl.name === name) return entry;
                }
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
