import type { IdentifierOccurrences, ScopeMetadata, ScopeSymbolMetadata } from "./types.js";

/**
 * Represents a single lexical or structural scope in GML.
 */
export class Scope {
    public id: string;
    public kind: string;
    public parent: Scope | null;
    public symbolMetadata: Map<string, ScopeSymbolMetadata>;
    public occurrences: Map<string, IdentifierOccurrences>;
    public stackIndex: number | null;
    public lastModifiedTimestamp: number;
    public modificationCount: number;
    public metadata: ScopeMetadata;

    constructor(id: string, kind: string, parent: Scope | null = null, metadata: ScopeMetadata = {}) {
        this.id = id;
        this.kind = kind;
        this.parent = parent;
        this.symbolMetadata = new Map();
        this.occurrences = new Map();
        this.stackIndex = null;
        this.lastModifiedTimestamp = -1;
        this.modificationCount = 0;
        this.metadata = metadata;
    }

    /**
     * Marks the scope as modified and updates timestamps.
     */
    public markModified(): void {
        this.lastModifiedTimestamp = Date.now();
        this.modificationCount += 1;
    }
}

/**
 * Ensures that an identifier occurrences entry exists in the scope.
 */
export function ensureIdentifierOccurrences(scope: Scope, name: string): IdentifierOccurrences {
    let entry = scope.occurrences.get(name);
    if (!entry) {
        entry = {
            declarations: [],
            references: []
        };
        scope.occurrences.set(name, entry);
    }

    return entry;
}
