import { isObjectLike } from "../../shared/utils.js";

function isIdentifierNode(node) {
    return node && typeof node === "object" && node.type === "Identifier";
}

export default class IdentifierMetadataManager {
    constructor({ scopeTracker, globalIdentifiers = new Set() } = {}) {
        this.scopeTracker = scopeTracker;
        this.globalIdentifiers = globalIdentifiers;
        this.identifierRoles = [];
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

    withIdentifierRole(role, callback) {
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

    applyCurrentRoleToIdentifier(name, node) {
        if (!this.isEnabled() || !name || !isIdentifierNode(node)) {
            return;
        }

        const role = this.cloneRole(this.getCurrentRole());
        const roleType =
            role.type === "declaration" ? "declaration" : "reference";

        if (roleType === "declaration") {
            this.scopeTracker.declare(name, node, role);
        } else {
            this.scopeTracker.reference(name, node, role);
        }
    }

    markGlobalIdentifier(node) {
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

    applyGlobalFlag(node) {
        if (!isIdentifierNode(node)) {
            return;
        }

        if (this.globalIdentifiers.has(node.name)) {
            node.isGlobalIdentifier = true;
        }
    }

    createIdentifierLocation(token) {
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
}
