import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { Core } from "@gml-modules/core";
import { ScopeTracker } from "./scope-tracker.js";

export class SemanticScopeCoordinator {
    private scopeTracker: ScopeTracker;
    private identifierRoleTracker: IdentifierRoleTracker;
    private globalIdentifierRegistry: GlobalIdentifierRegistry;

    constructor() {
        this.scopeTracker = new ScopeTracker();
        this.identifierRoleTracker = new IdentifierRoleTracker();
        this.globalIdentifierRegistry = new GlobalIdentifierRegistry();
    }

    get globalIdentifiers() {
        return this.globalIdentifierRegistry.globalIdentifiers;
    }

    withScope(kind, callback) {
        this.scopeTracker.enterScope(kind);
        try {
            return callback();
        } finally {
            this.scopeTracker.exitScope();
        }
    }

    withRole(role, callback) {
        return this.identifierRoleTracker.withRole(role, callback);
    }

    cloneRole(role) {
        return this.identifierRoleTracker.cloneRole(role);
    }

    applyCurrentRoleToIdentifier(name, node) {
        if (!name || !Core.isIdentifierNode(node)) {
            return;
        }

        const role = this.identifierRoleTracker?.cloneRole(
            this.identifierRoleTracker?.getCurrentRole()
        );
        const roleType =
            role?.type === "declaration" ? "declaration" : "reference";

        if (roleType === "declaration") {
            this.scopeTracker.declare(name, node, role);
        } else {
            this.scopeTracker.reference(name, node, role);
        }
    }
}

class IdentifierRoleTracker {
    identifierRoles: Array<object>;

    constructor() {
        this.identifierRoles = [];
    }

    withRole(role, callback) {
        this.identifierRoles.push(role);
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

        return this.identifierRoles.at(-1);
    }

    cloneRole(role) {
        if (!role) {
            return {};
        }

        const cloned = { ...role };

        if (role.tags !== undefined) {
            cloned.tags = [...Core.toArray(role.tags)];
        }

        return cloned;
    }
}

class GlobalIdentifierRegistry {
    globalIdentifiers: Set<unknown>;

    constructor({ globalIdentifiers = new Set() } = {}) {
        this.globalIdentifiers = globalIdentifiers;
    }

    markIdentifier(node: MutableGameMakerAstNode | null | undefined) {
        if (!Core.isIdentifierNode(node) || !Core.isObjectLike(node)) {
            return;
        }

        const { name } = node;
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
export function createIdentifierLocation(token) {
    if (!token) {
        return null;
    }

    const { line } = token;
    const startIndex = token.start ?? token.startIndex;
    const stopIndex = token.stop ?? token.stopIndex ?? startIndex;
    // Preserve `undefined` for missing column so we don't emit `column: null` in
    // the location objects. Tests and consumers expect the `column` property to
    // be omitted when not available from the token metadata.
    const startColumn = token.column;
    const identifierLength =
        Number.isInteger(startIndex) && Number.isInteger(stopIndex)
            ? stopIndex - startIndex + 1
            : undefined;

    const buildPoint = (
        index,
        column
    ): { line: any; index: any; column?: number } => {
        const point: { line: any; index: any; column?: number } = {
            line,
            index
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
    };
}
