import { Core } from "@gml-modules/core";
import type { MutableGameMakerAstNode } from "@gml-modules/core";

function getStaticFunctionDeclarator(statement) {
    if (!statement || statement.type !== "VariableDeclaration") {
        return null;
    }

    if (statement.kind !== "static") {
        return null;
    }

    if (!Core.isNonEmptyArray(statement.declarations)) {
        return null;
    }

    const [declarator] = statement.declarations;
    if (!declarator || declarator.id?.type !== "Identifier") {
        return null;
    }

    return declarator;
}

function isStaticFunctionDeclaration(statement) {
    const declarator = getStaticFunctionDeclarator(statement);
    return declarator?.init?.type === "FunctionDeclaration";
}

function extractStaticFunctionName(statement) {
    const declarator = getStaticFunctionDeclarator(statement);

    if (!declarator) {
        return null;
    }

    if (!Core.isIdentifierNode(declarator.id)) {
        return null;
    }
    return Core.getNonEmptyString(declarator.id.name);
}

function collectConstructorInfos(ast) {
    if (!ast || typeof ast !== "object") {
        return new Map();
    }

    const constructors = new Map();

    for (const node of Core.getBodyStatements(ast as Record<string, unknown>)) {
        if (!Core.isNode(node) || node.type !== "ConstructorDeclaration") {
            continue;
        }

        const name = Core.isIdentifierNode(node.id)
            ? Core.getNonEmptyString(node.id.name)
            : null;
        if (!name) {
            continue;
        }

        let parentName = null;
        if (
            Core.isNode(node.parent) &&
            node.parent.type === "ConstructorParentClause"
        ) {
            const parentId = (node.parent as any).id;
            parentName = Core.isIdentifierNode(parentId)
                ? Core.getNonEmptyString(parentId.name)
                : null;
        }

        const staticFunctions = new Map();

        for (const statement of Core.getBodyStatements(
            (node as Record<string, unknown>).body as Record<string, unknown>
        )) {
            const declarator = getStaticFunctionDeclarator(statement);
            if (declarator?.init?.type !== "FunctionDeclaration") {
                continue;
            }

            const staticName = Core.isIdentifierNode(declarator.id)
                ? Core.getNonEmptyString(declarator.id.name)
                : null;
            if (!staticName || staticFunctions.has(staticName)) {
                continue;
            }

            staticFunctions.set(staticName, statement as MutableGameMakerAstNode);
        }

        constructors.set(name, {
            node,
            parentName,
            staticFunctions
        });
    }

    return constructors;
}

function hasAncestorStaticFunction(constructors, startName, targetName) {
    const visited = new Set();
    let currentName = Core.getNonEmptyString(startName);

    while (currentName) {
        if (visited.has(currentName)) {
            break;
        }

        visited.add(currentName);
        const info = constructors.get(currentName);
        if (!info) {
            break;
        }

        if (info.staticFunctions.has(targetName)) {
            return true;
        }

        currentName = Core.getNonEmptyString(info.parentName);
    }

    return false;
}

export function annotateStaticFunctionOverrides(ast: any, opts?: any) {
    const constructors = collectConstructorInfos(ast);

    if (constructors.size === 0) {
        return;
    }

    for (const info of constructors.values()) {
        if (!info.parentName) {
            continue;
        }

        for (const [staticName, statement] of info.staticFunctions) {
            if (
                hasAncestorStaticFunction(
                    constructors,
                    info.parentName,
                    staticName
                )
            ) {
                statement._overridesStaticFunction = true;
            }
        }
    }
}

export function transform(ast, opts = {}) {
    return annotateStaticFunctionOverrides(ast, opts);
}
