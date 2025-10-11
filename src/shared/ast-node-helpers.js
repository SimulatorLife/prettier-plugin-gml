// Shared AST helper utilities focused on querying common node shapes.
// Centralizes frequently repeated guards so printer and transform modules
// can reuse the same defensive checks without duplicating logic.

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

    // Hoist the common type lookup; many callers are hot paths that check the
    // same field repeatedly while traversing AST nodes.
    const { type } = node;

    if (type === "Identifier") {
        const name = node.name;
        return typeof name === "string" ? name : null;
    }

    const directName = node.name;
    if (typeof directName === "string") {
        return directName;
    }

    if (type === "Literal") {
        const value = node.value;
        return typeof value === "string" ? value : null;
    }

    if (type === "MemberDotExpression") {
        const object = node.object;
        const property = node.property;

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

    if (type === "MemberIndexExpression") {
        const object = node.object;

        if (!object || object.type !== "Identifier") {
            return null;
        }

        const property = node.property;
        if (!Array.isArray(property) || property.length !== 1) {
            return null;
        }

        const indexText = getMemberIndexText(property[0]);
        if (indexText == null) {
            return null;
        }

        return object.name + "_" + indexText;
    }

    return null;
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

export { getIdentifierText, getSingleVariableDeclarator, isUndefinedLiteral };
