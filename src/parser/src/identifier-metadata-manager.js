import { isObjectLike } from "../../shared/object-utils.js";

function isIdentifierNode(node) {
    return node && typeof node === "object" && node.type === "Identifier";
}

/**
 * @typedef {object} IdentifierScopeService
 * @property {() => boolean} isEnabled
 * @property {(kind: string, callback: () => unknown) => unknown} withScope
 */

/**
 * @typedef {object} IdentifierRoleService
 * @property {(role: object | null | undefined, callback: () => unknown) => unknown} withIdentifierRole
 * @property {(role: object | null | undefined) => object} cloneRole
 */

/**
 * @typedef {object} IdentifierClassifierService
 * @property {(name: string | null | undefined, node: object | null | undefined) => void} applyRoleToIdentifier
 */

/**
 * @typedef {object} IdentifierGlobalService
 * @property {(node: object | null | undefined) => void} markGlobalIdentifier
 * @property {(node: object | null | undefined) => void} applyGlobalFlag
 */

/**
 * @typedef {object} IdentifierLocationService
 * @property {(token: object | null | undefined) => object | null} createIdentifierLocation
 */

function createIdentifierRoleService() {
    const identifierRoles = [];

    function getCurrentRole() {
        if (identifierRoles.length === 0) {
            return null;
        }

        return identifierRoles.at(-1);
    }

    function cloneRole(role) {
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

    return {
        withIdentifierRole(role, callback) {
            identifierRoles.push(role);
            try {
                return callback();
            } finally {
                identifierRoles.pop();
            }
        },
        cloneRole,
        getCurrentRole
    };
}

function createIdentifierScopeService({ scopeTracker }) {
    function isEnabled() {
        const tracker = scopeTracker;
        if (!tracker || typeof tracker.isEnabled !== "function") {
            return false;
        }

        return tracker.isEnabled();
    }

    function withScope(kind, callback) {
        if (!isEnabled()) {
            return callback();
        }

        scopeTracker.enterScope(kind);
        try {
            return callback();
        } finally {
            scopeTracker.exitScope();
        }
    }

    return {
        isEnabled,
        withScope
    };
}

function createIdentifierClassifierService({
    scopeTracker,
    isScopeEnabled,
    getCurrentRole,
    cloneRole
}) {
    return {
        applyRoleToIdentifier(name, node) {
            if (!isScopeEnabled() || !name || !isIdentifierNode(node)) {
                return;
            }

            const role = cloneRole(getCurrentRole());
            const roleType =
                role.type === "declaration" ? "declaration" : "reference";

            if (roleType === "declaration") {
                scopeTracker.declare(name, node, role);
            } else {
                scopeTracker.reference(name, node, role);
            }
        }
    };
}

function createIdentifierGlobalService({ globalIdentifiers }) {
    const identifiers = globalIdentifiers ?? new Set();

    return {
        markGlobalIdentifier(node) {
            if (!isIdentifierNode(node) || !isObjectLike(node)) {
                return;
            }

            const { name } = node;
            if (typeof name !== "string" || name.length === 0) {
                return;
            }

            identifiers.add(name);
            node.isGlobalIdentifier = true;
        },

        applyGlobalFlag(node) {
            if (!isIdentifierNode(node)) {
                return;
            }

            if (identifiers.has(node.name)) {
                node.isGlobalIdentifier = true;
            }
        }
    };
}

function createIdentifierLocationService() {
    return {
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
    };
}

/**
 * Create specialised services for tracking identifier metadata.
 *
 * @param {object} [options]
 * @param {object} [options.scopeTracker]
 * @param {Set<string>} [options.globalIdentifiers]
 * @returns {{
 *   scope: IdentifierScopeService,
 *   roles: IdentifierRoleService,
 *   classifier: IdentifierClassifierService,
 *   globals: IdentifierGlobalService,
 *   locations: IdentifierLocationService
 * }}
 */
export function createIdentifierMetadataServices(options = {}) {
    const { scopeTracker, globalIdentifiers } = options;

    const roleServiceInternal = createIdentifierRoleService();
    const scopeService = createIdentifierScopeService({ scopeTracker });
    const classifierService = createIdentifierClassifierService({
        scopeTracker,
        isScopeEnabled: scopeService.isEnabled,
        getCurrentRole: roleServiceInternal.getCurrentRole,
        cloneRole: roleServiceInternal.cloneRole
    });
    const globalService = createIdentifierGlobalService({
        globalIdentifiers
    });
    const locationService = createIdentifierLocationService();

    return {
        scope: {
            isEnabled: scopeService.isEnabled,
            withScope: scopeService.withScope
        },
        roles: {
            withIdentifierRole: roleServiceInternal.withIdentifierRole,
            cloneRole: roleServiceInternal.cloneRole
        },
        classifier: {
            applyRoleToIdentifier:
                classifierService.applyRoleToIdentifier
        },
        globals: globalService,
        locations: locationService
    };
}
