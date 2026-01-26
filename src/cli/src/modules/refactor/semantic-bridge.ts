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
     * Get the resources map from the project index.
     */
    private get resources(): any {
        return this.projectIndex.resources;
    }

    /**
     * Get the identifiers map, handling structural differences in the project index.
     */
    private get identifiers(): any {
        return this.projectIndex.identifiers ?? this.projectIndex.identifierCollections;
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
        const identifiers = this.identifiers;
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

        // 1. Try exact match first in identifiers
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

        // 2. Try exact match in resources
        const resource = this.findResourceByName(name);
        if (resource) {
            return this.generateResourceScipId(resource);
        }

        // 3. Try case-insensitive match as valid fallback
        const lowerName = name.toLowerCase();

        // 3a. Check identifiers case-insensitive
        for (const collectionName of priorityCollections) {
            const collection = identifiers[collectionName];
            if (!collection) continue;

            for (const key of Object.keys(collection)) {
                const entry = collection[key];

                if (entry.name && entry.name.toLowerCase() === lowerName) {
                    return this.generateScipId(entry);
                }

                if (Array.isArray(entry.declarations)) {
                    for (const decl of entry.declarations) {
                        if (decl.name && decl.name.toLowerCase() === lowerName) {
                            return this.generateScipId(entry, decl.name);
                        }
                    }
                }
            }
        }

        // 3b. Check resources case-insensitive
        const resourceCaseInsensitive = this.findResourceByName(name, true);
        if (resourceCaseInsensitive) {
            return this.generateResourceScipId(resourceCaseInsensitive);
        }

        return null;
    }

    /**
     * Find all occurrences of a symbol by its base name.
     */
    getSymbolOccurrences(symbolName: string): Array<SymbolOccurrence> {
        const occurrences: Array<SymbolOccurrence> = [];
        const identifiers = this.identifiers;

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

        // 3. Search for resource definitions
        const resource = this.findResourceByName(symbolName);
        if (resource) {
            occurrences.push({
                path: resource.path,
                start: 0,
                end: 0,
                scopeId: null,
                kind: OccurrenceKind.DEFINITION
            });
            // Also add all asset references as occurrences
            if (Array.isArray(resource.assetReferences)) {
                // Note: assetReferences in resource record point OUTWARDS.
                // We want references pointing TO this resource.
                // The semantic index tracks asset references in 'resources' but keyed by source.
                // To find references TO a resource, we'd iterate all resources and check their assetReferences.
                // This is expensive but necessary for full resource rename.
                // Optimally, ProjectIndex would invert this index.
                this.collectOccurrencesFromAssetReferences(symbolName, occurrences);
            }
        }

        return this.deduplicateOccurrences(occurrences);
    }

    /**
     * Collect occurrences from an entry.
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
     * Collect occurrences from asset references across all resources.
     */
    private collectOccurrencesFromAssetReferences(targetName: string, occurrences: Array<SymbolOccurrence>): void {
        const resources = this.resources;
        if (!resources) return;

        for (const key of Object.keys(resources)) {
            const res = resources[key];
            if (Array.isArray(res.assetReferences)) {
                for (const ref of res.assetReferences) {
                    if (ref.targetName === targetName) {
                        occurrences.push({
                            path: res.path,
                            start: 0,
                            end: 0,
                            scopeId: null,
                            kind: OccurrenceKind.REFERENCE
                        });
                    }
                }
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
        const identifiers = this.identifiers;
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
        const identifiers = this.identifiers;
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

        // Also check resources
        const resource = this.findResourceByName(name);
        if (resource) {
            return { name: resource.name };
        }

        return null;
    }

    private findSymbolInCollections(symbolId: string): any {
        const identifiers = this.identifiers;
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

            // Special handling for resource kinds
            if (["objects", "sprites", "sounds", "rooms", "paths", "scripts", "shaders", "fonts", "timelines", "tilesets"].includes(kind)) {
                const resource = this.findResourceByName(name);
                if (resource) {
                    // Create a synthetic symbol entry for the resource
                    return this.createSyntheticResourceEntry(resource, symbolId);
                }
            }

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

            // 4. Case-insensitive resource fallback for manual ID inputs
            const resourceLower = this.findResourceByName(name, true);
            if (resourceLower) {
                return this.createSyntheticResourceEntry(resourceLower, `gml/${kind}/${resourceLower.name}`);
            }
        }

        return null;
    }

    private findResourceByName(name: string, caseInsensitive = false): any {
        const resources = this.resources;
        if (!resources) return null;

        if (caseInsensitive) {
            const lowerName = name.toLowerCase();
            for (const key of Object.keys(resources)) {
                const res = resources[key];
                if (res.name?.toLowerCase() === lowerName) return res;
            }
        } else {
            for (const key of Object.keys(resources)) {
                const res = resources[key];
                if (res.name === name) return res;
            }
        }
        return null;
    }

    private generateResourceScipId(resource: any): string {
        // e.g. gml/objects/obj_player
        let kind = "resource";
        if (resource.resourceType === "GMObject") kind = "objects";
        else if (resource.resourceType === "GMSprite") kind = "sprites";
        else if (resource.resourceType === "GMRoom") kind = "rooms";
        else if (resource.resourceType === "GMScript") kind = "scripts";
        else if (resource.resourceType === "GMAudio") kind = "sounds";
        // fallback mapping

        return `gml/${kind}/${resource.name}`;
    }

    private createSyntheticResourceEntry(resource: any, symbolId: string): any {
        return {
            identifierId: symbolId,
            name: resource.name,
            kind: resource.resourceType,
            declarations: [{
                filePath: resource.path,
                start: { index: 0, line: 0, column: 0 },
                end: { index: 0, line: 0, column: 0 },
                kind: OccurrenceKind.DEFINITION
            }],
            references: [], // We'd need to populate this via asset scan if we want references visible here
            resourcePath: resource.path
        };
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
