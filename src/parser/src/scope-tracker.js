import { cloneLocation } from "../../shared/ast-locations.js";
import { isObjectLike } from "../../shared/object-utils.js";
import { toArray } from "../../shared/array-utils.js";

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

        return this.scopeStack[this.scopeStack.length - 1] ?? null;
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

        if (scopeOverride === "global") {
            return this.rootScope ?? currentScope;
        }

        if (
            isObjectLike(scopeOverride) &&
            typeof scopeOverride.id === "string"
        ) {
            return scopeOverride;
        }

        if (typeof scopeOverride === "string") {
            const found = this.scopeStack.find(
                (scope) => scope.id === scopeOverride
            );
            if (found) {
                return found;
            }
        }

        return currentScope;
    }

    buildClassifications(role, isDeclaration) {
        const tags = [];
        const pushUnique = (tag) => {
            if (tag && !tags.includes(tag)) {
                tags.push(tag);
            }
        };

        pushUnique("identifier");
        pushUnique(isDeclaration ? "declaration" : "reference");

        if (role && typeof role.kind === "string") {
            pushUnique(role.kind);
        }

        const extraTags = toArray(role?.tags);
        for (const tag of extraTags) {
            pushUnique(tag);
        }

        return tags;
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

    declare(name, node, role = {}) {
        if (!this.enabled || !name || !node) {
            return;
        }

        const scope = this.resolveScopeOverride(role.scopeOverride);
        const scopeId = scope?.id ?? null;
        const start = cloneLocation(node.start);
        const end = cloneLocation(node.end);
        const classifications = this.buildClassifications(role, true);

        const metadata = {
            name,
            scopeId,
            start,
            end,
            classifications
        };

        this.storeDeclaration(scope, name, metadata);

        node.scopeId = scopeId;
        node.declaration = {
            start: cloneLocation(start),
            end: cloneLocation(end),
            scopeId
        };
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

        if (declaration) {
            node.declaration = {
                start: cloneLocation(declaration.start),
                end: cloneLocation(declaration.end),
                scopeId: declaration.scopeId
            };
        } else {
            node.declaration = null;
        }
    }
}
