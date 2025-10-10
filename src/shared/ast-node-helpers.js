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

    if (typeof node.name === "string") {
        return node.name;
    }

    if (node.type === "Identifier") {
        return node.name || null;
    }

    if (node.type === "MemberIndexExpression") {
        const object = node.object;
        if (!object || object.type !== "Identifier") {
            return null;
        }

        if (!Array.isArray(node.property) || node.property.length !== 1) {
            return null;
        }

        const indexNode = node.property[0];
        const indexText = getIdentifierText(indexNode);
        if (indexText == null) {
            return null;
        }

        return `${object.name}_${indexText}`;
    }

    if (node.type === "MemberDotExpression") {
        const object = node.object;
        const property = node.property;

        if (!object || object.type !== "Identifier" || !property || property.type !== "Identifier") {
            return null;
        }

        return `${object.name}_${property.name}`;
    }

    if (node.type === "Literal" && typeof node.value === "string") {
        return node.value;
    }

    return null;
}

export { getIdentifierText, getSingleVariableDeclarator };
