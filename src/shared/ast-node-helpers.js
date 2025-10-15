import { asArray, isNonEmptyArray } from "./array-utils.js";

// Shared AST helper utilities focused on querying common node shapes.
// Centralizes frequently repeated guards so printer and transform modules
// can reuse the same defensive checks without duplicating logic.

/**
 * Retrieve the sole declarator from a variable declaration node.
 *
 * @param {object | null | undefined} node - Potential variable declaration
 *     node to inspect.
 * @returns {object | null} The single declarator when present, otherwise
 *     {@code null}.
 */
function getSingleVariableDeclarator(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    const { declarations } = node;
    if (!Array.isArray(declarations) || declarations.length !== 1) {
        return null;
    }

    const [declarator] = declarations;
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return null;
    }

    return declarator;
}

/**
 * Read and normalize the `kind` field from a variable declaration node.
 *
 * @param {object | null | undefined} node - Possible variable declaration
 *     wrapper exposed by the parser.
 * @returns {"var" | "global" | "static" | string | null} Lowercase
 *     declaration keyword when present, or {@code null} when the field is
 *     missing/unknown. The return type intentionally remains permissive so the
 *     printer can surface new keywords added by the parser without needing a
 *     project-wide update.
 */
function getVariableDeclarationKind(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    const { kind } = node;
    if (typeof kind !== "string" || kind.length === 0) {
        return null;
    }

    return kind.toLowerCase();
}

/**
 * Compare a declaration node against a specific keyword.
 *
 * @param {object | null | undefined} node - Candidate variable declaration.
 * @param {string | null | undefined} expectedKind - Keyword to match (e.g.
 *     {@code "var"}). The comparison is case-insensitive so callers may pass
 *     user input without pre-normalizing it.
 * @returns {boolean} {@code true} when {@code node.kind} resolves to the
 *     provided keyword.
 */
function isVariableDeclarationOfKind(node, expectedKind) {
    if (typeof expectedKind !== "string" || expectedKind.length === 0) {
        return false;
    }

    const normalizedKind = getVariableDeclarationKind(node);
    if (normalizedKind === null) {
        return false;
    }

    return normalizedKind === expectedKind.toLowerCase();
}

function isVarVariableDeclaration(node) {
    return isVariableDeclarationOfKind(node, "var");
}

/**
 * Normalize various identifier-like nodes to a comparable string.
 *
 * @param {string | null | undefined | { type?: string, name?: unknown, value?: unknown, object?: unknown, property?: unknown }} node
 *     Any AST fragment that may carry a name. String values are returned as-is.
 * @returns {string | null} Canonical identifier text, using underscores to
 *     flatten member access (e.g. {@code foo.bar} -> {@code "foo_bar"}) or
 *     {@code null} when the node does not resolve to a string name. The helper
 *     treats unexpected node shapes defensively, which allows callers inside
 *     hot printer paths to skip type checks without risking runtime failures.
 */
function getIdentifierText(node) {
    if (node == null) {
        return null;
    }

    if (typeof node === "string") {
        return node;
    }

    // Hoist the common type lookup so the switch below can reuse it without
    // repeatedly touching the same field during hot traversal paths.
    const { type } = node;

    switch (type) {
        case "Identifier": {
            const { name } = node;
            return typeof name === "string" ? name : null;
        }
        case "Literal": {
            const { value } = node;
            return typeof value === "string" ? value : null;
        }
        case "MemberDotExpression": {
            const { object, property } = node;

            if (
                !object ||
                object.type !== "Identifier" ||
                !property ||
                property.type !== "Identifier"
            ) {
                return null;
            }

            // String concatenation avoids the template literal machinery in this
            // hot branch, shaving work inside tight printer loops.
            return object.name + "_" + property.name;
        }
        case "MemberIndexExpression": {
            const object = node.object;

            if (!object || object.type !== "Identifier") {
                return null;
            }

            const property = node.property;
            if (!Array.isArray(property) || property.length !== 1) {
                return null;
            }

            const indexText = getMemberIndexText(property[0]);
            return indexText == null ? null : object.name + "_" + indexText;
        }
        default: {
            const { name } = node;
            return typeof name === "string" ? name : null;
        }
    }
}

/**
 * Extract the printable index portion of a {@link MemberIndexExpression}.
 *
 * @param {string | null | undefined | object} indexNode Possible node nested
 *     within {@code MemberIndexExpression.property}. Arrays are handled by the
 *     caller; this helper focuses on the single item case enforced by the
 *     parser.
 * @returns {string | null} Resolved index name or {@code null} when the parser
 *     emitted a non-string structure (for example, computed expressions). The
 *     defensive guards let callers gracefully skip edge cases without
 *     introducing conditional branches at the call site.
 */
function getMemberIndexText(indexNode) {
    if (typeof indexNode === "string") {
        return indexNode;
    }

    if (indexNode == null) {
        return null;
    }

    const indexName = indexNode.name;
    if (typeof indexName === "string") {
        return indexName;
    }

    const indexType = indexNode.type;
    if (indexType === "Literal") {
        const value = indexNode.value;
        return typeof value === "string" ? value : null;
    }

    return getIdentifierText(indexNode);
}

/**
 * Safely read the argument array from a call-like AST node.
 *
 * @param {object | null | undefined} callExpression Potential call expression
 *     node that may expose an {@code arguments} array.
 * @returns {Array<unknown>} Normalized argument collection. Returns a shared
 *     empty array when no arguments exist so callers can iterate without
 *     additional null checks.
 */
// Reuse a shared frozen array so the hot call-expression helper can return an
// allocation-free result when arguments are missing. The printer hits this
// helper in tight loops, so avoiding `[]` creations prevents millions of throw-
// away arrays during large format runs.
const SHARED_EMPTY_ARRAY = Object.freeze([]);

function getCallExpressionArguments(callExpression) {
    if (!callExpression || typeof callExpression !== "object") {
        return SHARED_EMPTY_ARRAY;
    }

    const { arguments: args } = callExpression;
    return Array.isArray(args) ? args : SHARED_EMPTY_ARRAY;
}

function getArrayProperty(node, propertyName) {
    if (!isNode(node)) {
        return [];
    }

    if (typeof propertyName !== "string" || propertyName.length === 0) {
        return [];
    }

    return asArray(node[propertyName]);
}

function hasArrayPropertyEntries(node, propertyName) {
    if (!isNode(node)) {
        return false;
    }

    if (typeof propertyName !== "string" || propertyName.length === 0) {
        return false;
    }

    return isNonEmptyArray(node[propertyName]);
}

function getBodyStatements(node) {
    return getArrayProperty(node, "body");
}

function hasBodyStatements(node) {
    return hasArrayPropertyEntries(node, "body");
}

function getBooleanLiteralValue(node, options = {}) {
    if (!node || node.type !== "Literal") {
        return null;
    }

    const acceptBooleanPrimitives =
        typeof options === "boolean"
            ? options
            : !!options?.acceptBooleanPrimitives;

    const { value } = node;

    if (value === true || value === false) {
        if (!acceptBooleanPrimitives) {
            return null;
        }

        return value ? "true" : "false";
    }

    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.toLowerCase();
    return normalized === "true" || normalized === "false" ? normalized : null;
}

function isBooleanLiteral(node, options) {
    return getBooleanLiteralValue(node, options) !== null;
}

function isUndefinedLiteral(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    const { value } = node;
    if (typeof value !== "string") {
        return false;
    }

    return value.toLowerCase() === "undefined";
}

function isNode(value) {
    return value != null && typeof value === "object";
}

export {
    getSingleVariableDeclarator,
    getVariableDeclarationKind,
    getIdentifierText,
    getCallExpressionArguments,
    getArrayProperty,
    hasArrayPropertyEntries,
    getBodyStatements,
    hasBodyStatements,
    getBooleanLiteralValue,
    isBooleanLiteral,
    isUndefinedLiteral,
    isNode,
    isVariableDeclarationOfKind,
    isVarVariableDeclaration
};
