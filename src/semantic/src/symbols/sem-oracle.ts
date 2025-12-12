import { Core } from "@gml-modules/core";

/**
 * Infer the semantic kind of an identifier from its classifications and
 * declaration metadata. This supports hot reload coordination by enabling
 * targeted invalidation based on symbol categories.
 *
 * @param {object} node - AST node with classifications and declaration metadata
 * @returns {"script"|"macro"|"enum"|"enum-member"|"global"|"instance"|"local"|"builtin"|"unknown"}
 */
export function kindOfIdent(node) {
    if (!Core.isObjectLike(node)) {
        return "unknown";
    }

    const classifications = Core.asArray(node.classifications);

    if (node.isBuiltIn === true || classifications.includes("builtin")) {
        return "builtin";
    }

    if (classifications.includes("script")) {
        return "script";
    }

    if (classifications.includes("macro")) {
        return "macro";
    }

    if (classifications.includes("enum")) {
        return "enum";
    }

    if (classifications.includes("enum-member")) {
        return "enum-member";
    }

    if (classifications.includes("global")) {
        return "global";
    }

    if (classifications.includes("instance")) {
        return "instance";
    }

    if (
        classifications.includes("variable") ||
        classifications.includes("parameter")
    ) {
        return "local";
    }

    return "local";
}

/**
 * Extract the identifier name from an AST node, supporting both direct name
 * properties and nested identifier structures.
 *
 * @param {object} node - AST node or identifier
 * @returns {string} The identifier name or empty string if unavailable
 */
export function nameOfIdent(node) {
    if (!Core.isObjectLike(node)) {
        return "";
    }

    if (typeof node.name === "string") {
        return node.name;
    }

    if (
        Core.isObjectLike(node.identifier) &&
        typeof node.identifier.name === "string"
    ) {
        return node.identifier.name;
    }

    return "";
}

/**
 * Build a qualified symbol identifier from a node's scope and name information.
 * Returns a stable reference format for dependency tracking and hot reload
 * coordination: `{kind}/{scope}/{name}` for scoped symbols or `{kind}/{name}`
 * for global declarations.
 *
 * @param {object} node - AST node with semantic annotations
 * @returns {string|null} Qualified symbol path or null if unavailable
 */
export function qualifiedSymbol(node) {
    if (!Core.isObjectLike(node)) {
        return null;
    }

    const name = nameOfIdent(node);
    if (!name) {
        return null;
    }

    const kind = kindOfIdent(node);
    if (kind === "unknown") {
        return null;
    }

    const scopeId = node.scopeId ?? node.declaration?.scopeId;

    if (scopeId && typeof scopeId === "string") {
        return `${kind}/${scopeId}/${name}`;
    }

    return `${kind}/${name}`;
}

/**
 * Determine the call target kind from a call expression node. This supports
 * hot reload invalidation by identifying whether a call targets a script,
 * method, builtin function, or other callable entity.
 *
 * @param {object} node - Call expression AST node
 * @returns {"script"|"method"|"builtin"|"constructor"|"unknown"}
 */
export function callTargetKind(node) {
    if (!Core.isObjectLike(node)) {
        return "unknown";
    }

    const callee = node.callee ?? node.function ?? node.target;
    if (!Core.isObjectLike(callee)) {
        return "unknown";
    }

    const classifications = Core.asArray(callee.classifications);

    if (callee.isBuiltIn === true || classifications.includes("builtin")) {
        return "builtin";
    }

    if (classifications.includes("script")) {
        return "script";
    }

    if (classifications.includes("method")) {
        return "method";
    }

    if (classifications.includes("constructor")) {
        return "constructor";
    }

    if (Core.isIdentifierNode(callee) && callee.name) {
        const firstChar = callee.name[0];
        if (firstChar === firstChar.toUpperCase() && /^[A-Z]/.test(firstChar)) {
            return "constructor";
        }
    }

    return "unknown";
}

/**
 * Extract the qualified symbol identifier for a call target. Useful for
 * dependency tracking and hot reload coordination by providing a stable
 * reference to the callable being invoked.
 *
 * @param {object} node - Call expression AST node
 * @returns {string|null} Qualified symbol identifier or null if unavailable
 */
export function callTargetSymbol(node) {
    if (!Core.isObjectLike(node)) {
        return null;
    }

    const callee = node.callee ?? node.function ?? node.target;
    if (!Core.isObjectLike(callee)) {
        return null;
    }

    return qualifiedSymbol(callee);
}

export default {
    kindOfIdent,
    nameOfIdent,
    qualifiedSymbol,
    callTargetKind,
    callTargetSymbol
};
