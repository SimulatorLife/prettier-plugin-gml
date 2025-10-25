import { isNonEmptyArray } from "../shared/array-utils.js";
import { getBodyStatements } from "../shared/ast-node-helpers.js";
import { getNonEmptyString } from "../shared/string-utils.js";

function isStaticFunctionDeclaration(statement) {
    if (!statement || statement.type !== "VariableDeclaration") {
        return false;
    }

    if (statement.kind !== "static") {
        return false;
    }

    if (!isNonEmptyArray(statement.declarations)) {
        return false;
    }

    const [declarator] = statement.declarations;
    if (!declarator || declarator.id?.type !== "Identifier") {
        return false;
    }

    return declarator.init?.type === "FunctionDeclaration";
}

function extractStaticFunctionName(statement) {
    if (!statement || statement.type !== "VariableDeclaration") {
        return null;
    }

    if (!isNonEmptyArray(statement.declarations)) {
        return null;
    }

    const [declarator] = statement.declarations;
    if (!declarator || declarator.id?.type !== "Identifier") {
        return null;
    }

    return getNonEmptyString(declarator.id.name);
}

function collectConstructorInfos(ast) {
    if (!ast || typeof ast !== "object") {
        return new Map();
    }

    const constructors = new Map();

    for (const node of getBodyStatements(ast)) {
        if (!node || node.type !== "ConstructorDeclaration") {
            continue;
        }

        const name = getNonEmptyString(node.id);
        if (!name) {
            continue;
        }

        const parentName =
            node.parent?.type === "ConstructorParentClause"
                ? getNonEmptyString(node.parent.id)
                : null;

        const staticFunctions = new Map();

        for (const statement of getBodyStatements(node.body)) {
            if (!isStaticFunctionDeclaration(statement)) {
                continue;
            }

            const staticName = extractStaticFunctionName(statement);
            if (!staticName || staticFunctions.has(staticName)) {
                continue;
            }

            staticFunctions.set(staticName, statement);
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
    let currentName = getNonEmptyString(startName);

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

        currentName = getNonEmptyString(info.parentName);
    }

    return false;
}

export function annotateStaticFunctionOverrides(ast) {
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
