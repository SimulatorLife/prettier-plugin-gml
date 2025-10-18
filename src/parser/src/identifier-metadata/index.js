import { isObjectLike } from "../../../shared/utils.js";

/**
 * The previous IdentifierMetadataManager bundled scope management, role tracking,
 * and global identifier bookkeeping behind a single "manager" contract. That
 * made consumers depend on capabilities they did not always need, so this module
 * exposes smaller, purpose-driven collaborators instead.
 */

function isIdentifierNode(node) {
    return node && typeof node === "object" && node.type === "Identifier";
}

/**
 * @typedef {object} IdentifierRoleTrackerInterface
 * @property {(role: object | null | undefined, callback: () => any) => any} withRole
 * @property {() => object | null} getCurrentRole
 * @property {(role: object | null | undefined) => object} cloneRole
 */

export class IdentifierRoleTracker {
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

        if (role.tags != undefined) {
            cloned.tags = Array.isArray(role.tags)
                ? [...role.tags]
                : [role.tags];
        }

        return cloned;
    }
}

/**
 * @typedef {object} IdentifierScopeCoordinatorInterface
 * @property {() => boolean} isEnabled
 * @property {(kind: unknown, callback: () => any) => any} withScope
 * @property {(name: string | null | undefined, node: unknown) => void} applyCurrentRoleToIdentifier
 */

export class IdentifierScopeCoordinator {
    constructor({ scopeTracker, roleTracker } = {}) {
        this.scopeTracker = scopeTracker;
        this.roleTracker = roleTracker;
    }

    isEnabled() {
        const tracker = this.scopeTracker;
        if (!tracker || typeof tracker.isEnabled !== "function") {
            return false;
        }

        return tracker.isEnabled();
    }

    withScope(kind, callback) {
        if (!this.isEnabled()) {
            return callback();
        }

        this.scopeTracker.enterScope(kind);
        try {
            return callback();
        } finally {
            this.scopeTracker.exitScope();
        }
    }

    applyCurrentRoleToIdentifier(name, node) {
        if (!this.isEnabled() || !name || !isIdentifierNode(node)) {
            return;
        }

        const role = this.roleTracker?.cloneRole(
            this.roleTracker?.getCurrentRole()
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

/**
 * @typedef {object} GlobalIdentifierRegistryInterface
 * @property {(node: unknown) => void} markIdentifier
 * @property {(node: unknown) => void} applyToNode
 */

export class GlobalIdentifierRegistry {
    constructor({ globalIdentifiers = new Set() } = {}) {
        this.globalIdentifiers = globalIdentifiers;
    }

    markIdentifier(node) {
        if (!isIdentifierNode(node) || !isObjectLike(node)) {
            return;
        }

        const { name } = node;
        if (typeof name !== "string" || name.length === 0) {
            return;
        }

        this.globalIdentifiers.add(name);
        node.isGlobalIdentifier = true;
    }

    applyToNode(node) {
        if (!isIdentifierNode(node)) {
            return;
        }

        if (this.globalIdentifiers.has(node.name)) {
            node.isGlobalIdentifier = true;
        }
    }
}

export function createIdentifierLocation(token) {
    if (!token) {
        return null;
    }

    const { line } = token;
    const startIndex = token.start ?? token.startIndex ?? null;
    const stopIndex = token.stop ?? token.stopIndex ?? startIndex ?? null;
    const startColumn = token.column ?? null;
    const identifierLength =
        startIndex != undefined && stopIndex != undefined
            ? stopIndex - startIndex + 1
            : null;

    const buildPoint = (index, column) => {
        const point = { line, index };
        if (column != undefined) {
            point.column = column;
        }

        return point;
    };

    return {
        start: buildPoint(startIndex, startColumn),
        end: buildPoint(
            stopIndex == undefined ? null : stopIndex + 1,
            startColumn != undefined && identifierLength != undefined
                ? startColumn + identifierLength
                : null
        )
    };
}
