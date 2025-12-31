import {
    Core,
    type GameMakerAstNode,
    type MutableGameMakerAstNode
} from "@gml-modules/core";
import {
    ScopeOverrideKeyword,
    formatKnownScopeOverrideKeywords,
    isScopeOverrideKeyword
} from "./scope-override-keywords.js";
import { ROLE_DEF, ROLE_REF } from "../symbols/scip-types.js";

type IdentifierOccurrences = {
    declarations: Array<ReturnType<typeof createOccurrence>>;
    references: Array<ReturnType<typeof createOccurrence>>;
};

type Occurrence = Record<string, unknown>;

type ScopeSummary = {
    hasDeclaration: boolean;
    hasReference: boolean;
};

type ScopeRole = {
    type?: string;
    scopeOverride?: unknown;
    tags?: Iterable<string>;
    kind?: string;
};

class Scope {
    public id: string;
    public kind: string;
    public parent: Scope | null;
    public symbolMetadata: Map<
        string,
        ReturnType<typeof cloneDeclarationMetadata>
    >;
    public occurrences: Map<string, IdentifierOccurrences>;
    public stackIndex: number | null;
    public lastModifiedTimestamp: number;
    public modificationCount: number;

    constructor(id, kind, parent: Scope | null = null) {
        this.id = id;
        this.kind = kind;
        this.parent = parent;
        this.symbolMetadata = new Map();
        this.occurrences = new Map();
        this.stackIndex = null;
        this.lastModifiedTimestamp = -1;
        this.modificationCount = 0;
    }

    markModified() {
        this.lastModifiedTimestamp = Date.now();
        this.modificationCount += 1;
    }
}

function createOccurrence(kind, metadata, source, declarationMetadata) {
    const declaration = declarationMetadata
        ? Core.assignClonedLocation(
              { scopeId: declarationMetadata.scopeId ?? null },
              declarationMetadata
          )
        : null;

    const usageContext =
        kind === "declaration" ? null : extractUsageContext(source);

    return Core.assignClonedLocation(
        {
            kind,
            name: metadata?.name ?? null,
            scopeId: metadata?.scopeId ?? null,
            classifications: Core.toMutableArray(metadata?.classifications, {
                clone: true
            }) as string[],
            declaration,
            usageContext
        },
        source ?? {}
    );
}

function extractUsageContext(node: unknown) {
    if (!Core.isObjectLike(node)) {
        return null;
    }

    const context: {
        isRead?: boolean;
        isWrite?: boolean;
        isAssignmentTarget?: boolean;
        isCallTarget?: boolean;
        parentType?: string;
    } = {};

    const nodeAny = node as Record<string, unknown>;

    if (nodeAny.isAssignmentTarget === true) {
        context.isAssignmentTarget = true;
        context.isWrite = true;
    }

    if (nodeAny.isCallTarget === true) {
        context.isCallTarget = true;
        context.isRead = true;
    }

    if (typeof nodeAny.parentType === "string") {
        context.parentType = nodeAny.parentType;
    }

    if (!context.isWrite && !context.isRead) {
        context.isRead = true;
    }

    return Object.keys(context).length > 0 ? context : null;
}

function cloneClassifications(
    classifications: ReadonlyArray<string> | null | undefined
) {
    return Core.toMutableArray(classifications, { clone: true });
}

function cloneDeclarationMetadata(metadata) {
    if (!metadata) {
        return null;
    }

    return {
        name: metadata.name ?? null,
        scopeId: metadata.scopeId ?? null,
        classifications: cloneClassifications(metadata.classifications),
        start: Core.cloneLocation(metadata.start),
        end: Core.cloneLocation(metadata.end)
    };
}

function cloneOccurrence(occurrence) {
    if (!occurrence) {
        return null;
    }

    const declarationClone = occurrence.declaration
        ? {
              scopeId: occurrence.declaration.scopeId ?? null,
              start: Core.cloneLocation(occurrence.declaration.start),
              end: Core.cloneLocation(occurrence.declaration.end)
          }
        : null;

    const usageContextClone = occurrence.usageContext
        ? { ...occurrence.usageContext }
        : null;

    return {
        ...occurrence,
        classifications: cloneClassifications(occurrence.classifications),
        declaration: declarationClone,
        usageContext: usageContextClone,
        start: Core.cloneLocation(occurrence.start),
        end: Core.cloneLocation(occurrence.end)
    };
}

function ensureIdentifierOccurrences(scope, name) {
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

function resolveStringScopeOverride(tracker, scopeOverride, currentScope) {
    if (isScopeOverrideKeyword(scopeOverride)) {
        return scopeOverride === ScopeOverrideKeyword.GLOBAL
            ? (tracker.rootScope ?? currentScope)
            : currentScope;
    }

    const found = tracker.scopeStack.find(
        (scope) => scope.id === scopeOverride
    );

    if (found) {
        return found;
    }

    const keywords = formatKnownScopeOverrideKeywords();
    throw new RangeError(
        `Unknown scope override string '${scopeOverride}'. Expected one of: ${keywords}, or a known scope identifier.`
    );
}

export class ScopeTracker {
    private scopeCounter: number = 0;
    private scopeStack: Scope[];
    private rootScope: Scope | null;
    private scopesById: Map<string, Scope>;
    private symbolToScopesIndex: Map<string, Map<string, ScopeSummary>>; // symbol -> Map<scopeId, ScopeSummary>
    private enabled: boolean;
    private identifierRoleTracker: IdentifierRoleTracker;
    private globalIdentifierRegistry: GlobalIdentifierRegistry;

    constructor({ enabled = true } = {}) {
        this.scopeStack = [];
        this.rootScope = null;
        this.scopesById = new Map();
        // Map: symbol -> Map<scopeId, { hasDeclaration: boolean, hasReference: boolean }>
        this.symbolToScopesIndex = new Map<
            string,
            Map<string, { hasDeclaration: boolean; hasReference: boolean }>
        >();
        this.enabled = Boolean(enabled);
        this.identifierRoleTracker = new IdentifierRoleTracker();
        this.globalIdentifierRegistry = new GlobalIdentifierRegistry();
    }

    withScope<T>(kind: string, callback: () => T): T {
        this.enterScope(kind);
        try {
            return callback();
        } finally {
            this.exitScope();
        }
    }

    enterScope(kind) {
        const parent = this.scopeStack.at(-1) ?? null;
        const scope = new Scope(
            `scope-${this.scopeCounter++}`,
            kind ?? "unknown",
            parent
        );
        this.scopeStack.push(scope);
        this.scopesById.set(scope.id, scope);
        scope.stackIndex = this.scopeStack.length - 1;
        if (!this.rootScope) {
            this.rootScope = scope;
        }
        return scope;
    }

    exitScope() {
        const scope = this.scopeStack.pop();
        if (scope) {
            scope.stackIndex = null;
        }
    }

    currentScope() {
        return this.scopeStack.at(-1) ?? null;
    }

    getRootScope() {
        return this.rootScope;
    }

    resolveScopeOverride(scopeOverride) {
        const currentScope = this.currentScope();

        if (!scopeOverride) {
            return currentScope;
        }

        if (
            Core.isObjectLike(scopeOverride) &&
            typeof scopeOverride.id === "string"
        ) {
            return scopeOverride;
        }

        if (typeof scopeOverride === "string") {
            return resolveStringScopeOverride(
                this,
                scopeOverride,
                currentScope
            );
        }

        return currentScope;
    }

    buildClassifications(
        role?: ScopeRole | null,
        isDeclaration: boolean = false
    ) {
        const tags = new Set([
            "identifier",
            isDeclaration ? "declaration" : "reference"
        ]);

        const roleKind = role?.kind;
        if (typeof roleKind === "string") {
            tags.add(roleKind);
        }

        for (const tag of Core.toArray(role?.tags)) {
            if (tag) {
                tags.add(tag);
            }
        }

        return [...tags];
    }

    storeDeclaration(scope, name, metadata) {
        if (!scope || !name) {
            return;
        }
        scope.symbolMetadata.set(name, metadata);
    }

    recordScopeOccurrence(
        scope: Scope | null | undefined,
        name: string | null | undefined,
        occurrence: Occurrence
    ) {
        if (!scope || !name || !occurrence) {
            return;
        }

        const entry = ensureIdentifierOccurrences(scope, name);

        if (occurrence.kind === "reference") {
            entry.references.push(occurrence);
        } else {
            entry.declarations.push(occurrence);
        }

        scope.markModified();

        // Ensure a per-symbol index exists
        let scopeSummaryMap = this.symbolToScopesIndex.get(name);
        if (!scopeSummaryMap) {
            scopeSummaryMap = new Map<string, ScopeSummary>();
            this.symbolToScopesIndex.set(name, scopeSummaryMap);
        }

        // Ensure a summary entry exists for this scope
        let scopeSummary = scopeSummaryMap.get(scope.id);
        if (!scopeSummary) {
            scopeSummary = { hasDeclaration: false, hasReference: false };
            scopeSummaryMap.set(scope.id, scopeSummary);
        }

        if (occurrence.kind === "reference") {
            scopeSummary.hasReference = true;
        } else {
            scopeSummary.hasDeclaration = true;
        }
    }

    lookup(name: string | null | undefined) {
        if (!this.enabled || !name) {
            return null;
        }

        for (let i = this.scopeStack.length - 1; i >= 0; i--) {
            const scope = this.scopeStack[i];
            const metadata = scope.symbolMetadata.get(name);
            if (metadata) {
                return metadata;
            }
        }

        return null;
    }

    /**
     * Annotate {@link node} as the declaration site for {@link name}. The
     * method persists metadata on the active scope tree so later references can
     * resolve back to their defining scope.
     *
     * When {@link role} includes a `scopeOverride` value, the declaration is
     * stored against that target instead of the current scope. The helper
     * tolerates missing identifiers and nodes so callers can guard optional
     * grammar branches without bespoke checks.
     *
     * @param name Identifier being declared.
     * @param node AST node whose identifier declarations are captured.
     * @param role Classification hints used for semantic tokens.
     */
    declare(
        name: string | null | undefined,
        node: MutableGameMakerAstNode | null | undefined,
        role: ScopeRole = { type: "declaration" }
    ) {
        if (!this.enabled || !name || !node) {
            return;
        }

        const scope = this.resolveScopeOverride(role.scopeOverride);
        const scopeId = scope?.id ?? null;
        const classifications = this.buildClassifications(role, true);

        const metadata = {
            name,
            scopeId,
            classifications
        };

        Core.assignClonedLocation(metadata, node);

        this.storeDeclaration(scope, name, metadata);

        node.scopeId = scopeId;
        node.declaration = Core.assignClonedLocation({ scopeId }, metadata);
        node.classifications = classifications as any;

        const occurrence = createOccurrence(
            "declaration",
            metadata,
            metadata,
            metadata
        );
        this.recordScopeOccurrence(
            scope,
            name,
            occurrence as unknown as Occurrence
        );
    }

    reference(
        name: string | null | undefined,
        node: MutableGameMakerAstNode | null | undefined,
        role: ScopeRole = { type: "reference" }
    ) {
        if (!name || !node) {
            return;
        }

        const scope = this.currentScope();
        const scopeId = scope?.id ?? null;
        const declaration = this.lookup(name);

        let derivedTags = [];
        if (declaration?.classifications) {
            derivedTags = declaration.classifications.filter(
                (tag) => tag !== "identifier" && tag !== "declaration"
            );
        }

        const combinedRole = {
            ...role,
            tags: [...derivedTags, ...Core.toArray(role?.tags)]
        };

        const classifications = this.buildClassifications(combinedRole, false);

        node.scopeId = scopeId;
        node.classifications = classifications as any;

        node.declaration = declaration
            ? Core.assignClonedLocation(
                  { scopeId: declaration.scopeId },
                  declaration
              )
            : null;

        const occurrenceMetadata = {
            name,
            scopeId,
            classifications
        };

        const occurrence = createOccurrence(
            "reference",
            occurrenceMetadata,
            node,
            declaration ?? null
        );
        this.recordScopeOccurrence(
            scope,
            name,
            occurrence as unknown as Occurrence
        );
    }

    exportOccurrences(
        includeReferences: boolean | { includeReferences?: boolean } = true
    ) {
        const includeRefs =
            typeof includeReferences === "boolean"
                ? includeReferences
                : Boolean(includeReferences?.includeReferences);
        const results = [];

        for (const scope of this.scopesById.values()) {
            const identifiers = [];

            for (const [name, entry] of scope.occurrences) {
                const declarations = entry.declarations.map((occurrence) =>
                    cloneOccurrence(occurrence)
                );
                const references = includeRefs
                    ? entry.references.map((occurrence) =>
                          cloneOccurrence(occurrence)
                      )
                    : [];

                if (declarations.length === 0 && references.length === 0) {
                    continue;
                }

                identifiers.push({
                    name,
                    declarations,
                    references
                });
            }

            if (identifiers.length > 0) {
                results.push({
                    scopeId: scope.id,
                    scopeKind: scope.kind,
                    lastModified: scope.lastModifiedTimestamp,
                    modificationCount: scope.modificationCount,
                    identifiers
                });
            }
        }

        return results;
    }

    /**
     * Export declaration and reference occurrences for a specific scope. The
     * structure mirrors {@link exportOccurrences} but narrows the output to a
     * single scope so consumers do not need to scan the entire project graph
     * when responding to focused hot reload events.
     *
     * @param {string} scopeId The scope identifier to export.
     * @param {{ includeReferences?: boolean }} [options]
     *        Controls whether reference occurrences should be included.
     * @returns {{scopeId: string, scopeKind: string, lastModified: number, modificationCount: number, identifiers: Array}} | null
     *          Scope occurrence payload, including modification metadata, or
     *          null if the tracker is disabled or the scope is unknown.
     */
    getScopeOccurrences(
        scopeId: string | null | undefined,
        { includeReferences = true } = {}
    ) {
        if (!scopeId) {
            return null;
        }

        const scope = this.scopesById.get(scopeId);
        if (!scope) {
            return null;
        }

        const includeRefs = Boolean(includeReferences);
        const identifiers = [];

        for (const [name, entry] of scope.occurrences) {
            const declarations = entry.declarations.map((occurrence) =>
                cloneOccurrence(occurrence)
            );
            const references = includeRefs
                ? entry.references.map((occurrence) =>
                      cloneOccurrence(occurrence)
                  )
                : [];

            if (declarations.length === 0 && references.length === 0) {
                continue;
            }

            identifiers.push({
                name,
                declarations,
                references
            });
        }

        return {
            scopeId: scope.id,
            scopeKind: scope.kind,
            lastModified: scope.lastModifiedTimestamp,
            modificationCount: scope.modificationCount,
            identifiers
        };
    }

    /**
     * Find all occurrences (declarations and references) of a specific symbol
     * across all scopes. This supports hot reload coordination by identifying
     * what needs to be recompiled when a symbol changes.
     *
     * @param {string} name The identifier name to search for.
     * @returns {Array<{scopeId: string, scopeKind: string, kind: string, occurrence: object}>}
     *          Array of occurrence records with scope context.
     */
    getSymbolOccurrences(name: string | null | undefined) {
        if (!name) {
            return [];
        }

        const scopeSummaryMap = this.symbolToScopesIndex.get(name);
        if (!scopeSummaryMap || scopeSummaryMap.size === 0) {
            return [];
        }

        const results = [];

        for (const scopeId of scopeSummaryMap.keys()) {
            const scope = this.scopesById.get(scopeId);
            if (!scope) {
                continue;
            }

            const entry = scope.occurrences.get(name);
            if (!entry) {
                continue;
            }

            for (const declaration of entry.declarations) {
                results.push({
                    scopeId: scope.id,
                    scopeKind: scope.kind,
                    kind: "declaration",
                    occurrence: cloneOccurrence(declaration)
                });
            }

            for (const reference of entry.references) {
                results.push({
                    scopeId: scope.id,
                    scopeKind: scope.kind,
                    kind: "reference",
                    occurrence: cloneOccurrence(reference)
                });
            }
        }

        return results;
    }

    /**
     * Get all scope IDs that contain occurrences (declarations or references) of
     * a specific symbol. This is optimized using an internal index for O(1)
     * average case lookup instead of scanning all scopes. Useful for hot reload
     * invalidation to quickly identify which scopes need recompilation when a
     * symbol changes.
     *
     * @param {string} name The symbol name to look up.
     * @returns {Array<string>} Array of scope IDs that contain the symbol, or
     *          empty array if not found or disabled.
     */
    getScopesForSymbol(name: string | null | undefined) {
        if (!name) {
            return [];
        }

        const scopeSummaryMap = this.symbolToScopesIndex.get(name);
        if (!scopeSummaryMap) {
            return [];
        }

        return [...scopeSummaryMap.keys()];
    }

    /**
     * Get per-scope summary metadata for a specific symbol. Each summary entry
     * indicates whether the symbol is declared and/or referenced within the
     * scope. This supports hot reload invalidation by distinguishing definition
     * scopes from dependent scopes without requiring callers to walk occurrence
     * lists manually.
     *
     * @param {string} name The symbol name to summarise.
     * @returns {Array<{scopeId: string, scopeKind: string, hasDeclaration: boolean, hasReference: boolean}>}
     *          Array of summary records for each scope containing the symbol.
     */
    getSymbolScopeSummary(name: string | null | undefined) {
        if (!name) {
            return [];
        }

        const scopeSummaryMap = this.symbolToScopesIndex.get(name);
        if (!scopeSummaryMap || scopeSummaryMap.size === 0) {
            return [];
        }

        const summaries = [];

        for (const [scopeId, summary] of scopeSummaryMap) {
            const scope = this.scopesById.get(scopeId);
            if (!scope) {
                continue;
            }

            summaries.push({
                scopeId,
                scopeKind: scope.kind,
                hasDeclaration: Boolean(summary.hasDeclaration),
                hasReference: Boolean(summary.hasReference)
            });
        }

        return summaries;
    }

    /**
     * Get a global summary of all symbols across all scopes. Returns aggregated
     * metadata for each unique symbol showing which scopes declare and reference
     * it, along with occurrence counts. This provides a bird's-eye view of the
     * entire symbol table for hot reload coordination, enabling quick assessment
     * of symbol usage patterns without iterating through individual scopes.
     *
     * @returns {Array<{name: string, scopeCount: number, declarationCount: number, referenceCount: number, scopes: Array<{scopeId: string, scopeKind: string, hasDeclaration: boolean, hasReference: boolean}>}>}
     *          Array of symbol summaries with aggregated usage metadata.
     */
    getAllSymbolsSummary() {
        if (!this.enabled) {
            return [];
        }

        const summaries = [];

        for (const [name, scopeSummaryMap] of this.symbolToScopesIndex) {
            let totalDeclarations = 0;
            let totalReferences = 0;
            const scopeDetails = [];

            for (const [scopeId, summary] of scopeSummaryMap) {
                const scope = this.scopesById.get(scopeId);
                if (!scope) {
                    continue;
                }

                const entry = scope.occurrences.get(name);
                if (entry) {
                    totalDeclarations += entry.declarations.length;
                    totalReferences += entry.references.length;
                }

                scopeDetails.push({
                    scopeId,
                    scopeKind: scope.kind,
                    hasDeclaration: Boolean(summary.hasDeclaration),
                    hasReference: Boolean(summary.hasReference)
                });
            }

            summaries.push({
                name,
                scopeCount: scopeSummaryMap.size,
                declarationCount: totalDeclarations,
                referenceCount: totalReferences,
                scopes: scopeDetails
            });
        }

        return summaries;
    }

    /**
     * Get all symbols (unique identifier names) declared or referenced in a
     * specific scope. This helps track dependencies and supports selective
     * recompilation strategies.
     *
     * @param {string} scopeId The scope identifier to query.
     * @returns {Array<string>} Array of unique identifier names in the scope.
     */
    getScopeSymbols(scopeId: string | null | undefined) {
        if (!scopeId) {
            return [];
        }

        const scope = this.scopesById.get(scopeId);
        if (!scope) {
            return [];
        }

        return [...scope.occurrences.keys()];
    }

    /**
     * Resolve an identifier name to its declaration metadata by walking up the
     * scope chain from a specified scope. This implements proper lexical scoping
     * rules and supports accurate binding resolution for transpilation.
     *
     * @param {string} name The identifier name to resolve.
     * @param {string} [scopeId] The scope to start resolution from. If omitted,
     *        uses the current scope.
     * @returns {object | null} The declaration metadata if found, or null.
     */
    resolveIdentifier(
        name: string | null | undefined,
        scopeId?: string | null
    ) {
        if (!name) {
            return null;
        }

        let startScope;
        if (scopeId) {
            startScope = this.scopesById.get(scopeId);
            if (!startScope) {
                return null;
            }
        } else {
            startScope = this.currentScope();
        }

        if (!startScope) {
            return null;
        }

        const storedIndex = startScope.stackIndex;
        const startIndex =
            typeof storedIndex === "number" &&
            storedIndex >= 0 &&
            storedIndex < this.scopeStack.length &&
            this.scopeStack[storedIndex] === startScope
                ? storedIndex
                : undefined;
        if (startIndex === undefined) {
            let current = startScope;
            while (current) {
                const declaration = current.symbolMetadata.get(name);
                if (declaration) {
                    return { ...declaration };
                }
                current = current.parent;
            }
            return null;
        }

        for (let i = startIndex; i >= 0; i -= 1) {
            const scope = this.scopeStack[i];
            const declaration = scope.symbolMetadata.get(name);
            if (declaration) {
                return { ...declaration };
            }
        }

        return null;
    }

    /**
     * Get the parent scope chain for a given scope, walking from the specified
     * scope up to the root. This enables efficient dependency tracking and
     * supports faster invalidation in hot reload pipelines.
     *
     * @param {string} scopeId The scope identifier to start from.
     * @returns {Array<{id: string, kind: string}>} Array of parent scopes from
     *          nearest to root, or empty array if scope not found or disabled.
     */
    getScopeChain(scopeId: string | null | undefined) {
        if (!scopeId) {
            return [];
        }

        const scope = this.scopesById.get(scopeId);
        if (!scope) {
            return [];
        }

        const chain = [];
        let current = scope;
        while (current) {
            chain.push({
                id: current.id,
                kind: current.kind
            });
            current = current.parent;
        }

        return chain;
    }

    /**
     * Get all declarations defined directly in a specific scope. This returns
     * only declarations in the specified scope, not from parent scopes. Useful
     * for hot reload coordination to identify what symbols are defined in a
     * particular file or scope unit.
     *
     * @param {string} scopeId The scope identifier to query.
     * @returns {Array<{name: string, metadata: object}>} Array of declarations
     *          with their names and full metadata.
     */
    getScopeDefinitions(scopeId: string | null | undefined) {
        if (!scopeId) {
            return [];
        }

        const scope = this.scopesById.get(scopeId);
        if (!scope) {
            return [];
        }

        const definitions = [];
        for (const [name, metadata] of scope.symbolMetadata) {
            definitions.push({
                name,
                metadata: { ...metadata }
            });
        }

        return definitions;
    }

    /**
     * Get all external references from a specific scope - references to symbols
     * declared in parent or ancestor scopes. This is crucial for hot reload
     * coordination because it identifies cross-scope dependencies: when a scope
     * is modified, any scope that references its symbols needs to be invalidated.
     *
     * Each external reference includes:
     * - The symbol name being referenced
     * - The scope where it was declared (or null if undeclared)
     * - Cloned declaration metadata for the resolved symbol (or null)
     * - All occurrence records where it's referenced in the queried scope
     *
     * This enables efficient dependency tracking: when editing a file/scope,
     * query its external references to know which parent symbols it depends on,
     * then update only the affected code paths during hot reload.
     *
     * @param {string} scopeId The scope identifier to query.
     * @returns {Array<{name: string, declaringScopeId: string | null, referencingScopeId: string, declaration: object | null, occurrences: Array<object>}>}
     *          Array of external reference records grouped by symbol name.
     */
    getScopeExternalReferences(scopeId: string | null | undefined) {
        if (!scopeId) {
            return [];
        }

        const scope = this.scopesById.get(scopeId);
        if (!scope) {
            return [];
        }

        const externalRefs = [];
        const processedSymbols = new Set();

        for (const [name, entry] of scope.occurrences) {
            if (processedSymbols.has(name)) {
                continue;
            }

            if (entry.references.length === 0) {
                continue;
            }

            const declaration = scope.symbolMetadata.get(name);
            if (declaration) {
                continue;
            }

            const resolvedDeclaration = this.resolveIdentifier(name, scopeId);
            const resolvedDeclarationClone =
                cloneDeclarationMetadata(resolvedDeclaration);
            const declaringScopeId = resolvedDeclarationClone?.scopeId ?? null;

            if (declaringScopeId === scopeId) {
                continue;
            }

            const occurrences = entry.references.map((occurrence) =>
                cloneOccurrence(occurrence)
            );

            externalRefs.push({
                name,
                declaringScopeId,
                referencingScopeId: scopeId,
                declaration: resolvedDeclarationClone,
                occurrences
            });

            processedSymbols.add(name);
        }

        return externalRefs;
    }

    /**
     * Get modification metadata for a specific scope. Returns the last
     * modification timestamp and the total number of modifications, which
     * supports hot reload coordination by identifying which scopes have
     * changed and need recompilation.
     *
     * @param {string} scopeId The scope identifier to query.
     * @returns {{scopeId: string, scopeKind: string, lastModified: number, modificationCount: number} | null}
     *          Modification metadata or null if scope not found.
     */
    getScopeModificationMetadata(scopeId: string | null | undefined) {
        if (!scopeId) {
            return null;
        }

        const scope = this.scopesById.get(scopeId);
        if (!scope) {
            return null;
        }

        return {
            scopeId: scope.id,
            scopeKind: scope.kind,
            lastModified: scope.lastModifiedTimestamp,
            modificationCount: scope.modificationCount
        };
    }

    /**
     * Get all scopes modified after a specific timestamp. This enables
     * incremental hot reload by identifying only the scopes that have changed
     * since the last compilation, avoiding full project rebuilds.
     *
     * @param {number} sinceTimestamp Only return scopes modified after this timestamp.
     * @returns {Array<{scopeId: string, scopeKind: string, lastModified: number, modificationCount: number}>}
     *          Array of modification metadata for scopes modified after the timestamp.
     */
    getModifiedScopes(sinceTimestamp: number = 0) {
        const modifiedScopes = [];

        for (const scope of this.scopesById.values()) {
            if (scope.lastModifiedTimestamp > sinceTimestamp) {
                modifiedScopes.push({
                    scopeId: scope.id,
                    scopeKind: scope.kind,
                    lastModified: scope.lastModifiedTimestamp,
                    modificationCount: scope.modificationCount
                });
            }
        }

        return modifiedScopes;
    }

    /**
     * Get the most recently modified scope across all tracked scopes. This
     * helps identify the latest change in the symbol table for hot reload
     * coordination and incremental invalidation.
     *
     * @returns {{scopeId: string, scopeKind: string, lastModified: number, modificationCount: number} | null}
     *          Metadata for the most recently modified scope, or null if no scopes exist.
     */
    getMostRecentlyModifiedScope() {
        let mostRecent: Scope | null = null;
        let latestTimestamp = -1;

        for (const scope of this.scopesById.values()) {
            if (scope.lastModifiedTimestamp > latestTimestamp) {
                latestTimestamp = scope.lastModifiedTimestamp;
                mostRecent = scope;
            }
        }

        if (!mostRecent) {
            return null;
        }

        return {
            scopeId: mostRecent.id,
            scopeKind: mostRecent.kind,
            lastModified: mostRecent.lastModifiedTimestamp,
            modificationCount: mostRecent.modificationCount
        };
    }

    /**
     * Get all write operations (assignments) for a specific symbol across all
     * scopes. This supports hot reload invalidation by identifying which scopes
     * write to a symbol, enabling precise dependency tracking for incremental
     * recompilation.
     *
     * @param {string} name The symbol name to query.
     * @returns {Array<{scopeId: string, scopeKind: string, occurrence: object}>}
     *          Array of write occurrence records with scope context.
     */
    getSymbolWrites(name: string | null | undefined) {
        if (!name) {
            return [];
        }

        const scopeSummaryMap = this.symbolToScopesIndex.get(name);
        if (!scopeSummaryMap || scopeSummaryMap.size === 0) {
            return [];
        }

        const writes = [];

        for (const scopeId of scopeSummaryMap.keys()) {
            const scope = this.scopesById.get(scopeId);
            if (!scope) {
                continue;
            }

            const entry = scope.occurrences.get(name);
            if (!entry) {
                continue;
            }

            for (const reference of entry.references) {
                if (reference.usageContext?.isWrite) {
                    writes.push({
                        scopeId: scope.id,
                        scopeKind: scope.kind,
                        occurrence: cloneOccurrence(reference)
                    });
                }
            }
        }

        return writes;
    }

    /**
     * Get all read operations for a specific symbol across all scopes. This
     * helps identify dependencies when a symbol's value changes, enabling
     * targeted invalidation for hot reload.
     *
     * @param {string} name The symbol name to query.
     * @returns {Array<{scopeId: string, scopeKind: string, occurrence: object}>}
     *          Array of read occurrence records with scope context.
     */
    getSymbolReads(name: string | null | undefined) {
        if (!name) {
            return [];
        }

        const scopeSummaryMap = this.symbolToScopesIndex.get(name);
        if (!scopeSummaryMap || scopeSummaryMap.size === 0) {
            return [];
        }

        const reads = [];

        for (const scopeId of scopeSummaryMap.keys()) {
            const scope = this.scopesById.get(scopeId);
            if (!scope) {
                continue;
            }

            const entry = scope.occurrences.get(name);
            if (!entry) {
                continue;
            }

            for (const reference of entry.references) {
                if (reference.usageContext?.isRead) {
                    reads.push({
                        scopeId: scope.id,
                        scopeKind: scope.kind,
                        occurrence: cloneOccurrence(reference)
                    });
                }
            }
        }

        return reads;
    }

    // Role tracking API (previously provided by SemanticScopeCoordinator)
    withRole(role: ScopeRole | null, callback: () => any) {
        return this.identifierRoleTracker.withRole(role, callback);
    }

    cloneRole(role: ScopeRole | null) {
        return this.identifierRoleTracker.cloneRole(role);
    }

    getCurrentRole() {
        return this.identifierRoleTracker.getCurrentRole();
    }

    // Public helper to apply the current role to an identifier node
    applyCurrentRoleToIdentifier(
        name: string | null | undefined,
        node: GameMakerAstNode | null | undefined
    ) {
        if (!name || !Core.isIdentifierNode(node)) {
            return;
        }

        const role = this.identifierRoleTracker.cloneRole(
            this.identifierRoleTracker.getCurrentRole()
        );
        const roleType =
            role?.type === "declaration" ? "declaration" : "reference";

        if (roleType === "declaration") {
            this.declare(name, node as MutableGameMakerAstNode, role);
        } else {
            this.reference(name, node as MutableGameMakerAstNode, role);
        }
    }

    // Global identifier registry API
    get globalIdentifiers() {
        return this.globalIdentifierRegistry.globalIdentifiers;
    }

    markGlobalIdentifier(node: MutableGameMakerAstNode | null | undefined) {
        this.globalIdentifierRegistry.markIdentifier(node);
    }

    applyGlobalIdentifiersToNode(
        node: MutableGameMakerAstNode | null | undefined
    ) {
        this.globalIdentifierRegistry.applyToNode(node);
    }

    /**
     * Get all symbol declarations across all scopes in the tracker.
     * Returns an array of declaration records with scope context, enabling
     * project-wide symbol analysis for dependency graphs, refactoring,
     * and hot reload coordination.
     *
     * Each record includes:
     * - Symbol name
     * - Scope ID where declared
     * - Scope kind (program, function, block, etc.)
     * - Cloned declaration metadata (location, classifications, etc.)
     *
     * Use case: Build a complete symbol table for the project to power
     * IDE features (go-to-definition, find-all-references), refactoring
     * tools (rename, extract function), and hot reload dependency tracking.
     *
     * @returns {Array<{name: string, scopeId: string, scopeKind: string, metadata: object}>}
     *          Array of declaration records sorted by scope ID then symbol name.
     */
    getAllDeclarations() {
        const declarations: Array<{
            name: string;
            scopeId: string;
            scopeKind: string;
            metadata: ReturnType<typeof cloneDeclarationMetadata>;
        }> = [];

        for (const scope of this.scopesById.values()) {
            for (const [name, metadata] of scope.symbolMetadata) {
                declarations.push({
                    name,
                    scopeId: scope.id,
                    scopeKind: scope.kind,
                    metadata: cloneDeclarationMetadata(metadata)
                });
            }
        }

        return declarations.sort((a, b) => {
            const scopeCmp = a.scopeId.localeCompare(b.scopeId);
            if (scopeCmp !== 0) {
                return scopeCmp;
            }
            return a.name.localeCompare(b.name);
        });
    }

    /**
     * Get metadata for a specific symbol declaration by name and scope.
     * Returns the declaration metadata if found, or null if the symbol
     * is not declared in the specified scope.
     *
     * This is more efficient than `getAllDeclarations()` when you need
     * to check a single symbol in a known scope.
     *
     * @param {string} name Symbol name to look up
     * @param {string} scopeId Scope identifier where the symbol should be declared
     * @returns {object | null} Cloned declaration metadata or null if not found
     */
    getDeclarationInScope(
        name: string | null | undefined,
        scopeId: string | null | undefined
    ) {
        if (!name || !scopeId) {
            return null;
        }

        const scope = this.scopesById.get(scopeId);
        if (!scope) {
            return null;
        }

        const metadata = scope.symbolMetadata.get(name);
        if (!metadata) {
            return null;
        }

        return cloneDeclarationMetadata(metadata);
    }

    /**
     * Export occurrences in SCIP (SCIP Code Intelligence Protocol) format for
     * hot reload coordination and cross-file dependency tracking.
     *
     * SCIP format represents each occurrence with:
     * - range: [startLine, startCol, endLine, endCol] tuple
     * - symbol: Qualified symbol identifier (e.g., "local::varName", "scope-0::param")
     * - symbolRoles: Bit flags indicating DEF (declaration) or REF (reference)
     *
     * This format enables the hot reload pipeline to:
     * - Track which symbols are defined/referenced in each file
     * - Build cross-file dependency graphs for selective recompilation
     * - Identify downstream code that needs invalidation when symbols change
     * - Support IDE features like go-to-definition and find-all-references
     *
     * Use case: When a file changes during hot reload, export its SCIP
     * occurrences to determine which symbols changed and which dependent
     * files need recompilation.
     *
     * @param {object} [options] Configuration options
     * @param {string} [options.scopeId] Limit export to a specific scope (omit for all scopes)
     * @param {boolean} [options.includeReferences=true] Include reference occurrences
     * @param {(name: string, scopeId: string) => string | null} [options.symbolGenerator]
     *        Custom function to generate qualified symbol names. If not provided,
     *        uses default format: "scopeId::name" for declarations, "local::name" for references.
     * @returns {Array<{scopeId: string, scopeKind: string, occurrences: Array<{range: [number, number, number, number], symbol: string, symbolRoles: number}>}>}
     *          Array of scope occurrence payloads in SCIP format, sorted by scope ID.
     */
    exportScipOccurrences(
        options: {
            scopeId?: string | null;
            includeReferences?: boolean;
            symbolGenerator?: (name: string, scopeId: string) => string | null;
        } = {}
    ) {
        const {
            scopeId = null,
            includeReferences = true,
            symbolGenerator = null
        } = options;

        const results: Array<{
            scopeId: string;
            scopeKind: string;
            occurrences: Array<{
                range: [number, number, number, number];
                symbol: string;
                symbolRoles: number;
            }>;
        }> = [];

        // Helper to generate default symbol names
        const defaultSymbolGenerator = (name: string, scopeId: string) => {
            return `${scopeId}::${name}`;
        };

        const getSymbol = symbolGenerator ?? defaultSymbolGenerator;

        // Helper to convert occurrence to SCIP format
        const toScipOccurrence = (
            occurrence: any,
            symbolRoles: number
        ): {
            range: [number, number, number, number];
            symbol: string;
            symbolRoles: number;
        } | null => {
            // Extract location data
            const start = occurrence?.start;
            const end = occurrence?.end;

            if (!start || !end) {
                return null;
            }

            const startLine =
                typeof start.line === "number" ? start.line : null;
            const startCol =
                typeof start.column === "number" ? start.column : 0;
            const endLine = typeof end.line === "number" ? end.line : null;
            const endCol = typeof end.column === "number" ? end.column : 0;

            if (startLine === null || endLine === null) {
                return null;
            }

            // Generate symbol identifier
            const name = occurrence?.name;
            const occScopeId = occurrence?.scopeId;

            if (!name || !occScopeId) {
                return null;
            }

            const symbol = getSymbol(name, occScopeId);
            if (!symbol) {
                return null;
            }

            return {
                range: [startLine, startCol, endLine, endCol],
                symbol,
                symbolRoles
            };
        };

        // Determine which scopes to process
        const scopesToProcess = scopeId
            ? [this.scopesById.get(scopeId)].filter(Boolean)
            : Array.from(this.scopesById.values());

        for (const scope of scopesToProcess) {
            const occurrences: Array<{
                range: [number, number, number, number];
                symbol: string;
                symbolRoles: number;
            }> = [];

            for (const entry of scope.occurrences.values()) {
                // Process declarations
                for (const declaration of entry.declarations) {
                    const scipOcc = toScipOccurrence(declaration, ROLE_DEF);
                    if (scipOcc) {
                        occurrences.push(scipOcc);
                    }
                }

                // Process references if requested
                if (includeReferences) {
                    for (const reference of entry.references) {
                        const scipOcc = toScipOccurrence(reference, ROLE_REF);
                        if (scipOcc) {
                            occurrences.push(scipOcc);
                        }
                    }
                }
            }

            if (occurrences.length > 0) {
                results.push({
                    scopeId: scope.id,
                    scopeKind: scope.kind,
                    occurrences
                });
            }
        }

        return results.sort((a, b) => a.scopeId.localeCompare(b.scopeId));
    }
}

// Provide a default export for backwards-compatible imports that import the
// module file directly (tests and some callers use a default import).
export default ScopeTracker;

// Internal identifier role tracker and registry (extracted from identifier-scope.ts)
class IdentifierRoleTracker {
    identifierRoles: Array<ScopeRole>;

    constructor() {
        this.identifierRoles = [];
    }

    withRole(role: ScopeRole | null, callback: () => any) {
        this.identifierRoles.push(role ?? ({} as ScopeRole));
        try {
            return callback();
        } finally {
            this.identifierRoles.pop();
        }
    }

    getCurrentRole() {
        if (this.identifierRoles.length === 0) {
            return null;
        }

        return this.identifierRoles.at(-1) ?? null;
    }

    cloneRole(role: ScopeRole | null) {
        if (!role) {
            return { type: "reference" } as ScopeRole;
        }

        const cloned = { ...role } as ScopeRole;

        if (role.tags !== undefined) {
            cloned.tags = [...Core.toArray(role.tags)];
        }

        // Ensure type is present on the cloned role for callers that expect
        // a fully formed role (e.g., parser identifier role usage expects a
        // `type` property to be present). Default to 'reference'.
        if (cloned.type === undefined) {
            cloned.type = "reference";
        }

        return cloned;
    }
}

class GlobalIdentifierRegistry {
    globalIdentifiers: Set<string>;

    constructor({ globalIdentifiers = new Set<string>() } = {}) {
        this.globalIdentifiers = globalIdentifiers;
    }

    markIdentifier(node: MutableGameMakerAstNode | null | undefined) {
        if (!Core.isIdentifierNode(node) || !Core.isObjectLike(node)) {
            return;
        }

        const { name } = node as { name?: unknown };
        if (typeof name !== "string" || name.length === 0) {
            return;
        }

        this.globalIdentifiers.add(name);
        const mutableNode = node as MutableGameMakerAstNode;
        mutableNode.isGlobalIdentifier = true;
    }

    applyToNode(node: MutableGameMakerAstNode | null | undefined) {
        if (!Core.isIdentifierNode(node)) {
            return;
        }

        if (this.globalIdentifiers.has(node.name)) {
            const mutableNode = node as MutableGameMakerAstNode;
            mutableNode.isGlobalIdentifier = true;
        }
    }
}

/**
 * Build a `{ start, end }` location object from a token, preserving `line`, `index`,
 * and optional `column` data. Returns `null` if no token is provided.
 * @param {object} token
 * @returns {{start: object, end: object} | null}
 */
export function createIdentifierLocation(token: any) {
    if (!token) {
        return null;
    }

    const { line } = token;
    const startIndex = token.start ?? token.startIndex;
    const stopIndex = token.stop ?? token.stopIndex ?? startIndex;
    const startColumn = token.column;
    const identifierLength =
        Number.isInteger(startIndex) && Number.isInteger(stopIndex)
            ? stopIndex - startIndex + 1
            : undefined;

    const buildPoint = (
        index: number | undefined,
        column?: number
    ): { line: number; index: number; column?: number } => {
        const point: { line: number; index: number; column?: number } = {
            line,
            index: index ?? 0
        } as any;
        if (column !== undefined) {
            point.column = column;
        }

        return point;
    };

    return {
        start: buildPoint(startIndex, startColumn),
        end: buildPoint(
            stopIndex === undefined ? undefined : stopIndex + 1,
            startColumn !== undefined && identifierLength !== undefined
                ? startColumn + identifierLength
                : undefined
        )
    } as any;
}
