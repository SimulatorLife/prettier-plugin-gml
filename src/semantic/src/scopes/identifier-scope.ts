import { type MutableGameMakerAstNode, type ScopeTracker as CoreScopeTracker } from "@gml-modules/core";

import { ScopeTracker } from "./scope-tracker.js";
import type { ScopeMetadata, ScopeRole } from "./types.js";

/**
 * Public facade that adapts the semantic {@link ScopeTracker} implementation to the
 * {@link CoreScopeTracker} interface expected by the parser's dependency-injection
 * contract. Keeping this adapter in `semantic` means the parser stays free of any
 * direct dependency on the semantic package.
 */
export class SemanticScopeCoordinator implements CoreScopeTracker {
    private scopeTracker: ScopeTracker;

    constructor() {
        this.scopeTracker = new ScopeTracker();
    }

    public get globalIdentifiers(): Set<string> {
        return this.scopeTracker.globalIdentifiers;
    }

    public withScope<T>(kind: string, callback: () => T, metadata: ScopeMetadata = {}): T {
        return this.scopeTracker.withScope(kind, callback, metadata);
    }

    public withRole<T>(role: ScopeRole | null, callback: () => T): T {
        return this.scopeTracker.withRole(role, callback);
    }

    public cloneRole(role: ScopeRole | null): ScopeRole {
        return this.scopeTracker.cloneRole(role);
    }

    public applyCurrentRoleToIdentifier(
        name: string | null | undefined,
        node: MutableGameMakerAstNode | null | undefined
    ): void {
        this.scopeTracker.applyCurrentRoleToIdentifier(name, node);
    }

    /**
     * Public helper to mark a node as a global identifier, delegated to the
     * internal GlobalIdentifierRegistry. Exposed so downstream consumers like
     * the AST builder can invoke it without accessing private fields.
     */
    public markGlobalIdentifier(node: MutableGameMakerAstNode | null | undefined): void {
        this.scopeTracker.markGlobalIdentifier(node);
    }

    /**
     * Public helper to apply global identifier metadata to a node.
     */
    public applyGlobalIdentifiersToNode(node: MutableGameMakerAstNode | null | undefined): void {
        this.scopeTracker.applyGlobalIdentifiersToNode(node);
    }

    /**
     * Internal access to the underlying scope tracker.
     */
    public getTracker(): ScopeTracker {
        return this.scopeTracker;
    }
}
