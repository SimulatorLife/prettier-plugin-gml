import { asArray, isNonEmptyArray } from "../utils/array.js";
import { isObjectLike } from "../utils/object.js";
import { isNonEmptyString } from "../utils/string.js";

// Shared AST helper utilities focused on querying common node shapes.
// Centralizes frequently repeated guards so printer and transform modules
// can reuse the same defensive checks without duplicating logic.

/**
 * Retrieve the sole declarator from a variable declaration node.
 *
 * @param {object | null | undefined} node - Potential variable declaration
 *     node to inspect.
 * @returns {object | null} The single declarator when present, otherwise
 *     `null`.
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
 * Clone an AST node while preserving primitives.
 *
 * The helper mirrors the defensive guards scattered across several transforms
 * that previously reimplemented this logic. Returning the original primitive
 * values keeps behaviour consistent for callers that occasionally pass
 * strings or numbers captured from the AST.
 *
 * @param {unknown} node Candidate AST fragment to clone.
 * @returns {unknown} A structural clone of the node or the original primitive
 *                    when cloning is unnecessary. `null` and `undefined`
 *                    resolve to `null` for easier downstream checks.
 */
function cloneAstNode(node) {
    if (node === null || node === undefined) {
        return null;
    }

    if (typeof node !== "object") {
        return node;
    }

    return structuredClone(node);
}

/**
 * Iterate over the object-valued children of an AST node.
 *
 * @param {unknown} node Potential AST node to inspect.
 * @param {(child: object, key: string) => void} callback Invoked for each
 *        enumerable own property whose value is object-like.
 */
function forEachNodeChild(node, callback) {
    if (!isObjectLike(node)) {
        return;
    }

    for (const [key, value] of Object.entries(node)) {
        if (!isObjectLike(value)) {
            continue;
        }

        callback(value, key);
    }
}

/**
 * Read and normalize the `kind` field from a variable declaration node.
 *
 * @param {object | null | undefined} node - Possible variable declaration
 *     wrapper exposed by the parser.
 * @returns {"var" | "global" | "static" | string | null} Lowercase
 *     declaration keyword when present, or `null` when the field is
 *     missing/unknown. The return type intentionally remains permissive so the
 *     printer can surface new keywords added by the parser without needing a
 *     project-wide update.
 */
function getVariableDeclarationKind(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    const { kind } = node;
    if (!isNonEmptyString(kind)) {
        return null;
    }

    return kind.toLowerCase();
}

/**
 * Compare a declaration node against a specific keyword.
 *
 * @param {object | null | undefined} node - Candidate variable declaration.
 * @param {string | null | undefined} expectedKind - Keyword to match (e.g.
 *     `"var"`). The comparison is case-insensitive so callers may pass
 *     user input without pre-normalizing it.
 * @returns {boolean} `true` when `node.kind` resolves to the
 *     provided keyword.
 */
function isVariableDeclarationOfKind(node, expectedKind) {
    if (!isNonEmptyString(expectedKind)) {
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
 *     flatten member access (e.g. `foo.bar` -> `"foo_bar"`) or
 *     `null` when the node does not resolve to a string name. The helper
 *     treats unexpected node shapes defensively, which allows callers inside
 *     hot printer paths to skip type checks without risking runtime failures.
 */
const identifierResolvers = Object.freeze({
    Identifier: resolveNodeName,
    Literal: (literal) =>
        typeof literal?.value === "string" ? literal.value : null,
    MemberDotExpression: (expression) => {
        const { object, property } = expression;
        if (!isIdentifierNode(object) || !isIdentifierNode(property)) {
            return null;
        }

        return object.name + "_" + property.name;
    },
    MemberIndexExpression: (expression) => {
        const { object, property } = expression;
        if (!isIdentifierNode(object) || !Array.isArray(property)) {
            return null;
        }

        if (property.length !== 1) {
            return null;
        }

        const indexText = getMemberIndexText(property[0]);
        return indexText === null ? null : object.name + "_" + indexText;
    }
});

function resolveNodeName(node) {
    return typeof node?.name === "string" ? node.name : null;
}

function isIdentifierNode(candidate) {
    return Boolean(candidate && candidate.type === "Identifier");
}

function getIdentifierText(node) {
    if (node === undefined || node === null) {
        return null;
    }

    if (typeof node === "string") {
        return node;
    }

    const { type } = node;
    if (typeof type !== "string") {
        return resolveNodeName(node);
    }

    const resolver = identifierResolvers[type] ?? resolveNodeName;
    return resolver(node);
}

/**
 * Extract the printable index portion of a {@link MemberIndexExpression}.
 *
 * @param {string | null | undefined | object} indexNode Possible node nested
 *     within `MemberIndexExpression.property`. Arrays are handled by the
 *     caller; this helper focuses on the single item case enforced by the
 *     parser.
 * @returns {string | null} Resolved index name or `null` when the parser
 *     emitted a non-string structure (for example, computed expressions). The
 *     defensive guards let callers gracefully skip edge cases without
 *     introducing conditional branches at the call site.
 */
function getMemberIndexText(indexNode) {
    if (typeof indexNode === "string") {
        return indexNode;
    }

    if (indexNode === undefined || indexNode === null) {
        return null;
    }

    const directName = resolveNodeName(indexNode);
    if (directName !== null) {
        return directName;
    }

    return getIdentifierText(indexNode);
}

/**
 * Return the sole property entry from a {@link MemberIndexExpression} when the
 * parser emitted exactly one index element. Several transforms guard against
 * unexpected array shapes before inspecting the property, so this helper
 * centralizes the defensive checks and keeps those call sites in sync.
 *
 * @param {unknown} node Candidate member index expression.
 * @returns {unknown | null} The single property entry or `null` when missing.
 */
function getSingleMemberIndexPropertyEntry(node) {
    if (!isNode(node) || node.type !== "MemberIndexExpression") {
        return null;
    }

    const { property } = node;
    if (!Array.isArray(property) || property.length !== 1) {
        return null;
    }

    const [propertyEntry] = property;
    return propertyEntry ?? null;
}

/**
 * Safely read the argument array from a call-like AST node.
 *
 * @param {object | null | undefined} callExpression Potential call expression
 *     node that may expose an `arguments` array.
 * @returns {Array<unknown>} Normalized argument collection. Returns a shared
 *     empty array when no arguments exist so callers can iterate without
 *     additional null checks.
 */
// Delegate to the shared array normalizer so call-expression traversals always
// reuse the same frozen empty array rather than recreating bespoke helpers.
function getCallExpressionArguments(callExpression) {
    if (!isNode(callExpression)) {
        return asArray();
    }

    return asArray(callExpression.arguments);
}

function getCallExpressionIdentifier(callExpression) {
    if (!isNode(callExpression) || callExpression.type !== "CallExpression") {
        return null;
    }

    const callee = callExpression.object;
    if (!isNode(callee) || callee.type !== "Identifier") {
        return null;
    }

    return resolveNodeName(callee) === null ? null : callee;
}

function getCallExpressionIdentifierName(callExpression) {
    const identifier = getCallExpressionIdentifier(callExpression);
    return identifier ? identifier.name : null;
}

function isCallExpressionIdentifierMatch(
    callExpression,
    expectedName,
    { caseInsensitive = false } = {}
) {
    if (!isNonEmptyString(expectedName)) {
        return false;
    }

    const identifierName = getCallExpressionIdentifierName(callExpression);
    if (!identifierName) {
        return false;
    }

    if (caseInsensitive) {
        const normalizedExpectedName = expectedName.toLowerCase();
        return identifierName.toLowerCase() === normalizedExpectedName;
    }

    return identifierName === expectedName;
}

function getArrayProperty(node, propertyName) {
    if (!isNode(node)) {
        return [];
    }

    if (!isNonEmptyString(propertyName)) {
        return [];
    }

    return asArray(node[propertyName]);
}

function hasArrayPropertyEntries(node, propertyName) {
    if (!isNode(node)) {
        return false;
    }

    if (!isNonEmptyString(propertyName)) {
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

function isProgramOrBlockStatement(node) {
    if (!isNode(node)) {
        return false;
    }

    const { type } = node;
    if (typeof type !== "string") {
        return false;
    }

    return type === "Program" || type === "BlockStatement";
}

function getLiteralStringValue(node) {
    if (!isNode(node) || node.type !== "Literal") {
        return null;
    }

    const { value } = node;
    if (typeof value !== "string") {
        return null;
    }

    return value.toLowerCase();
}

function getBooleanLiteralValue(node, options = {}) {
    if (!isNode(node) || node.type !== "Literal") {
        return null;
    }

    const acceptBooleanPrimitives =
        typeof options === "boolean"
            ? options
            : !!options?.acceptBooleanPrimitives;

    const { value } = node;
    const isBooleanPrimitive = value === true || value === false;

    if (!isBooleanPrimitive) {
        const normalized = getLiteralStringValue(node);
        return normalized === "true" || normalized === "false"
            ? normalized
            : null;
    }

    if (!acceptBooleanPrimitives) {
        return null;
    }

    return value ? "true" : "false";
}

function isBooleanLiteral(node, options) {
    return getBooleanLiteralValue(node, options) !== null;
}

function isUndefinedLiteral(node) {
    return getLiteralStringValue(node) === "undefined";
}

/**
 * Retrieve the `type` string from an AST node when present.
 *
 * @param {unknown} node Candidate AST node-like value.
 * @returns {string | null} The node's `type` when available, otherwise `null`.
 */
function getNodeType(node) {
    if (node === undefined || node === null) {
        return null;
    }

    if (typeof node !== "object") {
        return null;
    }

    const { type } = node;
    if (typeof type !== "string") {
        return null;
    }

    return type;
}

function isNode(value) {
    return value !== undefined && value !== null && typeof value === "object";
}

/**
 * Iterate over child nodes nested within {@link node}, invoking
 * {@link callback} for each descendant that should be inspected.
 *
 * Arrays forward every entry (including primitives) so traversal helpers can
 * reuse their existing guard rails without rebuilding bespoke loops. Plain
 * objects only forward nested objects to mirror the defensive checks found in
 * the transform visitors that previously duplicated this logic.
 *
 * @param {unknown} node Candidate AST fragment to inspect.
 * @param {(child: unknown) => void} callback Invoked for each descendant value.
 */
const visitChildNodesValuePool = [];

function borrowVisitChildNodesValueBuffer() {
    return visitChildNodesValuePool.pop() ?? [];
}

function releaseVisitChildNodesValueBuffer(buffer) {
    buffer.length = 0;
    visitChildNodesValuePool.push(buffer);
}

function visitChildNodes(node, callback) {
    if (node === undefined || node === null) {
        return;
    }

    if (Array.isArray(node)) {
        // Iterate over a shallow snapshot so callers that mutate the source
        // collection (for example by splicing siblings) do not cause entries to
        // be skipped. Forwarding the original references preserves behavioural
        // parity while keeping traversal order stable regardless of
        // modifications performed by the callback.
        const items = node.slice();

        for (const item of items) {
            callback(item);
        }

        return;
    }

    if (typeof node !== "object") {
        return;
    }

    // `Object.values` allocates a fresh array for every call which showed up in
    // tight printer loops. Snapshot the enumerable own values into a reusable
    // buffer so mutations performed by callbacks do not affect iteration order
    // while avoiding per-invocation allocations once the pool is warm.
    const values = borrowVisitChildNodesValueBuffer();
    let length = 0;

    try {
        for (const key in node) {
            if (!Object.hasOwn(node, key)) {
                continue;
            }

            const value = node[key];
            if (
                value !== undefined &&
                value !== null &&
                typeof value === "object"
            ) {
                values[length] = value;
                length += 1;
            }
        }

        for (let index = 0; index < length; index += 1) {
            callback(values[index]);
        }
    } finally {
        releaseVisitChildNodesValueBuffer(values);
    }
}

/**
 * Pushes {@link value} onto {@link stack} when it is an object, recursively
 * walking array entries so callers can enqueue nested nodes without repeating
 * the defensive guards. Non-object values are ignored to match the manual
 * traversal patterns used across the parser and printer.
 *
 * @param {Array<unknown>} stack
 * @param {unknown} value
 */
function enqueueObjectChildValues(stack, value) {
    if (!value || typeof value !== "object") {
        return;
    }

    if (Array.isArray(value)) {
        const { length } = value;

        // Manual index iteration avoids the iterator/closure overhead paid by
        // `for...of` on every call. The helper sits on tight AST traversal
        // loops, so keeping the branch predictable and allocation-free helps
        // repeated walks stay lean.
        for (let index = 0; index < length; index += 1) {
            const item = value[index];

            if (item !== null && typeof item === "object") {
                stack.push(item);
            }
        }
        return;
    }

    stack.push(value);
}

function unwrapParenthesizedExpression(node) {
    let current = node;

    while (isNode(current) && current.type === "ParenthesizedExpression") {
        const { expression } = current;

        if (!isNode(expression)) {
            break;
        }

        current = expression;
    }

    return current;
}

export {
    cloneAstNode,
    getSingleVariableDeclarator,
    getVariableDeclarationKind,
    getIdentifierText,
    getCallExpressionArguments,
    getCallExpressionIdentifier,
    getCallExpressionIdentifierName,
    isCallExpressionIdentifierMatch,
    forEachNodeChild,
    getArrayProperty,
    hasArrayPropertyEntries,
    getBodyStatements,
    hasBodyStatements,
    isProgramOrBlockStatement,
    getSingleMemberIndexPropertyEntry,
    getBooleanLiteralValue,
    isBooleanLiteral,
    isUndefinedLiteral,
    getNodeType,
    isNode,
    visitChildNodes,
    enqueueObjectChildValues,
    unwrapParenthesizedExpression,
    isVariableDeclarationOfKind,
    isVarVariableDeclaration
};
