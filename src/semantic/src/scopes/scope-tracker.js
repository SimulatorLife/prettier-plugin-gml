import {
    assignClonedLocation,
    isObjectLike,
    toArray,
    toMutableArray
} from "../dependencies.js";
import {
    ScopeOverrideKeyword,
    formatKnownScopeOverrideKeywords,
    isScopeOverrideKeyword
} from "./scope-override-keywords.js";

class Scope {
    constructor(id, kind, parent = null) {
        this.id = id;
        this.kind = kind;
        this.parent = parent;
        this.declarations = new Map();
        this.occurrences = new Map();
    }
}

function createOccurrence(kind, metadata, source, declarationMetadata) {
    const declaration = declarationMetadata
        ? assignClonedLocation(
              { scopeId: declarationMetadata.scopeId ?? null },
              declarationMetadata
          )
        : null;

    return assignClonedLocation(
        {
            kind,
            name: metadata?.name ?? null,
            scopeId: metadata?.scopeId ?? null,
            classifications: toMutableArray(metadata?.classifications, {
                clone: true
            }),
            declaration
        },
        source ?? {}
    );
}

function cloneOccurrence(occurrence) {
    const declaration = occurrence.declaration
        ? assignClonedLocation(
              { scopeId: occurrence.declaration.scopeId ?? null },
              occurrence.declaration
          )
        : null;

    return assignClonedLocation(
        {
            kind: occurrence.kind,
            name: occurrence.name,
            scopeId: occurrence.scopeId,
            classifications: toMutableArray(occurrence.classifications, {
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

export default class ScopeTracker {
    constructor({ enabled = false } = {}) {
        this.enabled = Boolean(enabled);
        this.scopeCounter = 0;
        this.scopeStack = [];
        this.rootScope = null;
        this.scopesById = new Map();
    }

    isEnabled() {
        return this.enabled;
    }

    enterScope(kind) {
        if (!this.enabled) {
            return null;
        }

        const parent = this.scopeStack.at(-1) ?? null;
        const scope = new Scope(
            `scope-${this.scopeCounter++}`,
            kind ?? "unknown",
            parent
        );
        this.scopeStack.push(scope);
        this.scopesById.set(scope.id, scope);
        if (!this.rootScope) {
            this.rootScope = scope;
        }
        return scope;
    }

    exitScope() {
        if (!this.enabled) {
            return;
        }

        this.scopeStack.pop();
    }

    currentScope() {
        if (!this.enabled) {
            return null;
        }

        return this.scopeStack.at(-1) ?? null;
    }

    getRootScope() {
        return this.rootScope;
    }

    resolveScopeOverride(scopeOverride) {
        if (!this.enabled) {
            return null;
        }

        const currentScope = this.currentScope();

        if (!scopeOverride) {
            return currentScope;
        }

        if (
            isObjectLike(scopeOverride) &&
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

    buildClassifications(role, isDeclaration) {
        const tags = new Set([
            "identifier",
            isDeclaration ? "declaration" : "reference"
        ]);

        const roleKind = role?.kind;
        if (typeof roleKind === "string") {
            tags.add(roleKind);
        }

        for (const tag of toArray(role?.tags)) {
            if (tag) {
                tags.add(tag);
            }
        }

        return [...tags];
    }

    storeDeclaration(scope, name, metadata) {
        if (!this.enabled || !scope || !name) {
            return;
        }

        scope.declarations.set(name, metadata);
    }

    recordScopeOccurrence(scope, name, occurrence) {
        if (!this.enabled || !scope || !name || !occurrence) {
            return;
        }

        const entry = ensureIdentifierOccurrences(scope, name);

        if (occurrence.kind === "reference") {
            entry.references.push(occurrence);
        } else {
            entry.declarations.push(occurrence);
        }
    }

    lookup(name) {
        if (!this.enabled || !name) {
            return null;
        }

        for (let i = this.scopeStack.length - 1; i >= 0; i--) {
            const scope = this.scopeStack[i];
            const metadata = scope.declarations.get(name);
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
     * @param {string | null | undefined} name Identifier being declared.
     * @param {import("../dependencies.js").GameMakerAstNode | null | undefined} node
     *        AST node representing the declaration site. The node is mutated to
     *        include scope and classification metadata when provided.
     * @param {{ scopeOverride?: unknown, tags?: Iterable<string>, kind?: string }}
     *        [role] Classification hints used for semantic tokens.
     */
    declare(name, node, role = {}) {
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

        assignClonedLocation(metadata, node);

        this.storeDeclaration(scope, name, metadata);

        node.scopeId = scopeId;
        node.declaration = assignClonedLocation({ scopeId }, metadata);
        node.classifications = classifications;

        const occurrence = createOccurrence(
            "declaration",
            metadata,
            metadata,
            metadata
        );
        this.recordScopeOccurrence(scope, name, occurrence);
    }

    reference(name, node, role = {}) {
        if (!this.enabled || !name || !node) {
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
            tags: [...derivedTags, ...toArray(role?.tags)]
        };

        const classifications = this.buildClassifications(combinedRole, false);

        node.scopeId = scopeId;
        node.classifications = classifications;

        node.declaration = declaration
            ? assignClonedLocation(
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

    exportOccurrences({ includeReferences = true } = {}) {
        if (!this.enabled) {
            return [];
        }

        const includeRefs = Boolean(includeReferences);
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
     * Find all occurrences (declarations and references) of a specific symbol
     * across all scopes. This supports hot reload coordination by identifying
     * what needs to be recompiled when a symbol changes.
     *
     * @param {string} name The identifier name to search for.
     * @returns {Array<{scopeId: string, scopeKind: string, kind: string, occurrence: object}>}
     *          Array of occurrence records with scope context.
     */
    getSymbolOccurrences(name) {
        if (!this.enabled || !name) {
            return [];
        }

        const results = [];

        for (const scope of this.scopesById.values()) {
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
     * Get all symbols (unique identifier names) declared or referenced in a
     * specific scope. This helps track dependencies and supports selective
     * recompilation strategies.
     *
     * @param {string} scopeId The scope identifier to query.
     * @returns {Array<string>} Array of unique identifier names in the scope.
     */
    getScopeSymbols(scopeId) {
        if (!this.enabled || !scopeId) {
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
    resolveIdentifier(name, scopeId) {
        if (!this.enabled || !name) {
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

        const scopeIndices = new Map();
        this.scopeStack.forEach((scope, index) => {
            scopeIndices.set(scope.id, index);
        });

        const startIndex = scopeIndices.get(startScope.id);
        if (startIndex === undefined) {
            const declaration = startScope.declarations.get(name);
            return declaration ? { ...declaration } : null;
        }

        for (let i = startIndex; i >= 0; i -= 1) {
            const scope = this.scopeStack[i];
            const declaration = scope.declarations.get(name);
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
    getScopeChain(scopeId) {
        if (!this.enabled || !scopeId) {
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
    getScopeDefinitions(scopeId) {
        if (!this.enabled || !scopeId) {
            return [];
        }

        const scope = this.scopesById.get(scopeId);
        if (!scope) {
            return [];
        }

        const definitions = [];
        for (const [name, metadata] of scope.declarations) {
            definitions.push({
                name,
                metadata: { ...metadata }
            });
        }

        return definitions;
    }
}
