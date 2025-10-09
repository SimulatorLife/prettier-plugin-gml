// Normalizes any identifier-like AST node to a simple string.
// Shared between the printer and supporting transforms to avoid duplicating
// node-shape guards.

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
        if (
            !object ||
            object.type !== "Identifier" ||
            typeof object.name !== "string"
        ) {
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

        if (
            !object ||
            object.type !== "Identifier" ||
            typeof object.name !== "string" ||
            !property ||
            property.type !== "Identifier" ||
            typeof property.name !== "string"
        ) {
            return null;
        }

        return `${object.name}_${property.name}`;
    }

    if (node.type === "Literal" && typeof node.value === "string") {
        return node.value;
    }

    return null;
}

export { getIdentifierText };
