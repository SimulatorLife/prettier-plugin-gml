/**
 * @typedef {object} IdentifierRoleTrackerInterface
 * @property {(role: object | null | undefined, callback: () => any) => any} withRole
 * @property {() => object | null} getCurrentRole
 * @property {(role: object | null | undefined) => object} cloneRole
 */
export declare class IdentifierRoleTracker {
    constructor();
    withRole(role: any, callback: any): any;
    getCurrentRole(): any;
    cloneRole(role: any): any;
}
/**
 * @typedef {object} IdentifierScopeAvailability
 * @property {() => boolean} isEnabled
 */
/**
 * @typedef {object} IdentifierScopeSession
 * @property {(kind: unknown, callback: () => any) => any} withScope
 */
/**
 * @typedef {object} IdentifierRoleApplication
 * @property {(name: string | null | undefined, node: unknown) => void} applyCurrentRoleToIdentifier
 */
/**
 * @implements {IdentifierScopeAvailability}
 * @implements {IdentifierScopeSession}
 * @implements {IdentifierRoleApplication}
 */
export declare class IdentifierScopeCoordinator {
    constructor({ scopeTracker, roleTracker }?: {});
    isEnabled(): any;
    withScope(kind: any, callback: any): any;
    applyCurrentRoleToIdentifier(name: any, node: any): void;
}
/**
 * @typedef {object} GlobalIdentifierRegistryInterface
 * @property {(node: unknown) => void} markIdentifier
 * @property {(node: unknown) => void} applyToNode
 */
export declare class GlobalIdentifierRegistry {
    constructor({ globalIdentifiers }?: {
        globalIdentifiers?: Set<unknown>;
    });
    markIdentifier(node: any): void;
    applyToNode(node: any): void;
}
/**
 * Build a `{ start, end }` location object from a token, preserving `line`, `index`,
 * and optional `column` data. Returns `null` if no token is provided.
 * @param {object} token
 * @returns {{start: object, end: object} | null}
 */
export declare function createIdentifierLocation(token: any): {
    start: {
        line: any;
        index: any;
    };
    end: {
        line: any;
        index: any;
    };
};
