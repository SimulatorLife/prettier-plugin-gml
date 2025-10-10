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
    if (!node) {
        return null;
    }

    if (typeof node === "string") {
        return node;
    }

    const { name } = node;
    if (typeof name === "string") {
        return name;
    }

    const { type } = node;

    if (type === "Literal") {
        const { value } = node;
        return typeof value === "string" ? value : null;
    }

    if (type === "MemberDotExpression") {
        const { object, property } = node;

        if (!object || object.type !== "Identifier" || !property || property.type !== "Identifier") {
            return null;
        }

        return `${object.name}_${property.name}`;
    }

    if (type === "MemberIndexExpression") {
        const { object, property } = node;

        if (!object || object.type !== "Identifier") {
            return null;
        }

        if (!Array.isArray(property) || property.length !== 1) {
            return null;
        }

        const indexText = getMemberIndexText(property[0]);
        if (indexText == null) {
            return null;
        }

        return `${object.name}_${indexText}`;
    }

    return null;
}

function getMemberIndexText(indexNode) {
    if (typeof indexNode === "string") {
        return indexNode;
    }

    if (!indexNode) {
        return null;
    }

    const { name: indexName, type: indexType } = indexNode;

    if (typeof indexName === "string") {
        return indexName;
    }

    if (indexType === "Literal") {
        const { value } = indexNode;
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
