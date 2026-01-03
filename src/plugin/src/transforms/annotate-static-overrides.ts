/**
 * Marks static constructor helper functions that override implementations inherited from parent constructors.
 * The `_overridesStaticFunction` flag ensures downstream normalizers and formatters know when a collision exists.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { createParserTransform } from "./functional-transform.js";

type AnnotateStaticFunctionOverridesTransformOptions = Record<string, never>;

type ConstructorInfo = {
    node: MutableGameMakerAstNode;
    parentName: string | null;
    staticFunctions: Map<string, MutableGameMakerAstNode>;
};

/**
 * Helper to validate that a statement declares a single static variable with a function initializer.
 */
function getStaticFunctionDeclarator(statement: MutableGameMakerAstNode | null | undefined) {
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

    if (!declarator) {
        return null;
    }

    const declaratorId = (declarator as { id?: unknown }).id;
    if (!Core.isIdentifierNode(declaratorId)) {
        return null;
    }

    return declarator;
}

/**
 * Pull the identifier name from a static declarator.
 */
function extractStaticFunctionName(statement: MutableGameMakerAstNode | null | undefined) {
    const declarator = getStaticFunctionDeclarator(statement);

    if (!declarator) {
        return null;
    }

    if (!Core.isIdentifierNode(declarator.id)) {
        return null;
    }

    return Core.getNonEmptyString(declarator.id.name);
}

/**
 * Identify static variable declarations that host function expressions/declarations.
 */
function isStaticFunctionDeclaration(statement: MutableGameMakerAstNode | null | undefined) {
    const declarator = getStaticFunctionDeclarator(statement);
    return declarator?.init?.type === "FunctionDeclaration" || declarator?.init?.type === "FunctionExpression";
}

/**
 * Search the constructor hierarchy to see if an ancestor already defines the named static helper.
 */
function findAncestorStaticFunction(
    constructors: Map<string, ConstructorInfo>,
    startName: string | null | undefined,
    targetName: string
): MutableGameMakerAstNode | null {
    const visited = new Set<string>();
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

        const ancestorStatic = info.staticFunctions.get(targetName);
        if (ancestorStatic) {
            return ancestorStatic;
        }

        currentName = Core.getNonEmptyString(info.parentName);
    }

    return null;
}

/**
 * Build a map of constructors with their names, parents, and declared static helper functions.
 */
function collectConstructorInfos(ast: MutableGameMakerAstNode): Map<string, ConstructorInfo> {
    if (!ast || typeof ast !== "object") {
        return new Map();
    }

    const constructors = new Map<string, ConstructorInfo>();
    const body = Core.getBodyStatements(ast as Record<string, unknown>);

    for (const node of body) {
        if (!Core.isNode(node) || node.type !== "ConstructorDeclaration") {
            continue;
        }

        const name = Core.isIdentifierNode(node.id)
            ? Core.getNonEmptyString(node.id.name)
            : typeof node.id === "string"
              ? Core.getNonEmptyString(node.id)
              : null;

        if (!name) {
            continue;
        }

        let parentName: string | null = null;
        if (Core.isNode(node.parent) && node.parent.type === "ConstructorParentClause") {
            const parentId = (node.parent as any).id;
            parentName = Core.isIdentifierNode(parentId)
                ? Core.getNonEmptyString(parentId.name)
                : typeof parentId === "string"
                  ? Core.getNonEmptyString(parentId)
                  : null;
        }

        const staticFunctions = new Map<string, MutableGameMakerAstNode>();

        const statements = Core.getBodyStatements(
            (node as Record<string, unknown>).body as Record<string, unknown>
        ) as MutableGameMakerAstNode[];

        for (const statement of statements) {
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
            node: node as MutableGameMakerAstNode,
            parentName,
            staticFunctions
        });
    }

    return constructors;
}

/**
 * Walk constructors, find duplicated static helpers, and set override metadata for conflicting members.
 */
function annotateStaticFunctionOverrides(ast: MutableGameMakerAstNode) {
    const constructors = collectConstructorInfos(ast);

    if (constructors.size === 0) {
        return;
    }

    for (const info of constructors.values()) {
        if (!info.parentName) {
            continue;
        }

        for (const [staticName, statement] of info.staticFunctions) {
            const ancestorStatic = findAncestorStaticFunction(constructors, info.parentName, staticName);
            if (ancestorStatic) {
                statement._overridesStaticFunction = true;
                statement._overridesStaticFunctionNode = ancestorStatic;
            }
        }
    }
}

function execute(
    ast: MutableGameMakerAstNode,
    _options: AnnotateStaticFunctionOverridesTransformOptions
): MutableGameMakerAstNode {
    void _options;
    annotateStaticFunctionOverrides(ast);
    return ast;
}

export const annotateStaticFunctionOverridesTransform =
    createParserTransform<AnnotateStaticFunctionOverridesTransformOptions>("annotate-static-overrides", {}, execute);
