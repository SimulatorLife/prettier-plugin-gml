import { assignClonedLocation, cloneLocation } from "./shared/ast.js";
import { isObjectLike, toArray } from "./shared/utils.js";
import {
    ScopeOverrideKeyword,
    formatKnownScopeOverrideKeywords,
    isScopeOverrideKeyword
} from "./scope-override-keywords.js";

class Scope {
    constructor(id, kind) {
        this.id = id;
        this.kind = kind;
        this.declarations = new Map();
    }
}

export default class ScopeTracker {
    constructor({ enabled = false } = {}) {
        this.enabled = Boolean(enabled);
        this.scopeCounter = 0;
        this.scopeStack = [];
        this.rootScope = null;
    }

    isEnabled() {
        return this.enabled;
    }

    enterScope(kind) {
        if (!this.enabled) {
            return null;
        }

        const scope = new Scope(
            `scope-${this.scopeCounter++}`,
            kind ?? "unknown"
        );
        this.scopeStack.push(scope);
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

        if (typeof scopeOverride !== "string") {
            return currentScope;
        }

        if (isScopeOverrideKeyword(scopeOverride)) {
            return scopeOverride === ScopeOverrideKeyword.GLOBAL
                ? (this.rootScope ?? currentScope)
                : currentScope;
        }

        const found = this.scopeStack.find(
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

    buildClassifications(role, isDeclaration) {
        const tags = new Set();

        tags.add("identifier");
        tags.add(isDeclaration ? "declaration" : "reference");

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
     * @param {import("./shared/ast.js").GameMakerAstNode | null | undefined} node
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
    }
}
