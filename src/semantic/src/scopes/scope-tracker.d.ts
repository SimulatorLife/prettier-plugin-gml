declare class Scope {
    constructor(id: any, kind: any, parent?: any);
}
export declare class ScopeTracker {
    constructor({ enabled }?: { enabled?: boolean });
    isEnabled(): any;
    enterScope(kind: any): Scope;
    exitScope(): void;
    currentScope(): any;
    getRootScope(): any;
    resolveScopeOverride(scopeOverride: any): any;
    buildClassifications(role: any, isDeclaration: any): string[];
    storeDeclaration(scope: any, name: any, metadata: any): void;
    recordScopeOccurrence(scope: any, name: any, occurrence: any): void;
    lookup(name: any): any;
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
    declare(name: any, node: any, role?: {}): void;
    reference(name: any, node: any, role?: {}): void;
    exportOccurrences({
        includeReferences
    }?: {
        includeReferences?: boolean;
    }): any[];
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
        scopeId: any,
        {
            includeReferences
        }?: {
            includeReferences?: boolean;
        }
    ): {
        scopeId: any;
        scopeKind: any;
        identifiers: any[];
    };
    /**
     * Find all occurrences (declarations and references) of a specific symbol
     * across all scopes. This supports hot reload coordination by identifying
     * what needs to be recompiled when a symbol changes.
     *
     * @param {string} name The identifier name to search for.
     * @returns {Array<{scopeId: string, scopeKind: string, kind: string, occurrence: object}>}
     *          Array of occurrence records with scope context.
     */
    getSymbolOccurrences(name: any): any[];
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
    getScopesForSymbol(name: any): any[];
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
    getSymbolScopeSummary(name: any): any[];
    /**
     * Get all symbols (unique identifier names) declared or referenced in a
     * specific scope. This helps track dependencies and supports selective
     * recompilation strategies.
     *
     * @param {string} scopeId The scope identifier to query.
     * @returns {Array<string>} Array of unique identifier names in the scope.
     */
    getScopeSymbols(scopeId: any): any[];
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
    resolveIdentifier(name: any, scopeId: any): any;
    /**
     * Get the parent scope chain for a given scope, walking from the specified
     * scope up to the root. This enables efficient dependency tracking and
     * supports faster invalidation in hot reload pipelines.
     *
     * @param {string} scopeId The scope identifier to start from.
     * @returns {Array<{id: string, kind: string}>} Array of parent scopes from
     *          nearest to root, or empty array if scope not found or disabled.
     */
    getScopeChain(scopeId: any): any[];
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
    getScopeDefinitions(scopeId: any): any[];
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
    getScopeExternalReferences(scopeId: any): any[];
}
export default ScopeTracker;
