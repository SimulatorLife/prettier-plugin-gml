import { Core } from "@gml-modules/core";
import type {
    GameMakerAstNode,
    MutableGameMakerAstNode
} from "@gml-modules/core";

import {
    ScopeOverrideKeyword,
    formatKnownScopeOverrideKeywords,
    isScopeOverrideKeyword
} from "./scope-override-keywords.js";

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

    constructor(id, kind, parent: Scope | null = null) {
        this.id = id;
        this.kind = kind;
        this.parent = parent;
        this.symbolMetadata = new Map();
        this.occurrences = new Map();
    }
}

function createOccurrence(kind, metadata, source, declarationMetadata) {
    const declaration = declarationMetadata
        ? Core.assignClonedLocation(
              { scopeId: declarationMetadata.scopeId ?? null },
              declarationMetadata
          )
        : null;

    return Core.assignClonedLocation(
        {
            kind,
            name: metadata?.name ?? null,
            scopeId: metadata?.scopeId ?? null,
            classifications: Core.toMutableArray(metadata?.classifications, {
                clone: true
            }),
            declaration
        },
        source ?? {}
    );
}

function cloneDeclarationMetadata(metadata) {
    if (!metadata) {
        return null;
    }

    return Core.assignClonedLocation(
        {
            name: metadata.name ?? null,
            scopeId: metadata.scopeId ?? null,
            classifications: Core.toMutableArray(metadata.classifications, {
                clone: true
            })
        },
        metadata
    );
}

function cloneOccurrence(occurrence) {
    const declaration = occurrence.declaration
        ? Core.assignClonedLocation(
              { scopeId: occurrence.declaration.scopeId ?? null },
              occurrence.declaration
          )
        : null;

    return Core.assignClonedLocation(
        {
            kind: occurrence.kind,
            name: occurrence.name,
            scopeId: occurrence.scopeId,
            classifications: Core.toMutableArray(occurrence.classifications, {
                clone: true
            }),
            declaration
        },
        occurrence
    );
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
    private scopeCounter: number;
    private scopeStack: Scope[];
    private rootScope: Scope | null;
    private scopesById: Map<string, Scope>;
    private symbolToScopesIndex: Map<string, Map<string, ScopeSummary>>; // symbol -> Map<scopeId, ScopeSummary>
    private scopeStackIndices: Map<string, number>;
    private enabled: boolean;

    constructor({ enabled = true } = {}) {
        this.scopeCounter = 0;
        this.scopeStack = [];
        this.rootScope = null;
        this.scopesById = new Map();
        // Map: symbol -> Map<scopeId, { hasDeclaration: boolean, hasReference: boolean }>
        this.symbolToScopesIndex = new Map<
            string,
            Map<string, { hasDeclaration: boolean; hasReference: boolean }>
        >();
        this.scopeStackIndices = new Map();
        this.enabled = Boolean(enabled);
    }

    enterScope(kind) {
        const parent = this.scopeStack.at(-1) ?? null;
        const scope = new Scope(
            `scope-${this.scopeCounter++}`,
            kind ?? "unknown",
            parent
        );
        this.scopeStack.push(scope);
        this.scopeStackIndices.set(scope.id, this.scopeStack.length - 1);
        this.scopesById.set(scope.id, scope);
        if (!this.rootScope) {
            this.rootScope = scope;
        }
        return scope;
    }

    exitScope() {
        const scope = this.scopeStack.pop();
        if (scope) {
            this.scopeStackIndices.delete(scope.id);
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
        role: ScopeRole = {}
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
        this.recordScopeOccurrence(scope, name, occurrence);
    }

    reference(
        name: string | null | undefined,
        node: MutableGameMakerAstNode | null | undefined,
        role: ScopeRole = {}
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
        this.recordScopeOccurrence(scope, name, occurrence);
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
     * @returns {{scopeId: string, scopeKind: string, identifiers: Array}} | null
     *          Scope occurrence payload or null if the tracker is disabled or
     *          the scope is unknown.
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
        scopeId?: string | null | undefined
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

        const startIndex = this.scopeStackIndices.get(startScope.id);
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
}

// Provide a default export for backwards-compatible imports that import the
// module file directly (tests and some callers use a default import).
export default ScopeTracker;
