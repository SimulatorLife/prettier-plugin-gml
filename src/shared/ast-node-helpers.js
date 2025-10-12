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
    getIdentifierText,
    isUndefinedLiteral,
    isNode
};
