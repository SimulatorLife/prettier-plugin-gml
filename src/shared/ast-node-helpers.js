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

export { getSingleVariableDeclarator };
