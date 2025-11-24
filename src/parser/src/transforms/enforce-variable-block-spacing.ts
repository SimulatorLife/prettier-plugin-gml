import { Core } from "@gml-modules/core";

import { resolveVariableBlockSpacingMinDeclarations } from "../options/variable-block-spacing-options.js";

// Avoid destructuring the Core namespace; call Core functions directly.

export function enforceVariableBlockSpacing(ast: any, options?: any) {
    if (!ast || typeof ast !== "object") {
        return;
    }

    const visitedNodes = new WeakSet();
    const minDeclarationRunLength =
        resolveVariableBlockSpacingMinDeclarations(options);

    visitNode(ast, visitedNodes, minDeclarationRunLength);
}

function visitNode(node, visitedNodes, minDeclarationRunLength) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (visitedNodes.has(node)) {
        return;
    }

    visitedNodes.add(node);

    if (Array.isArray(node)) {
        for (const entry of node) {
            visitNode(entry, visitedNodes, minDeclarationRunLength);
        }
        return;
    }

    if (node.type === "BlockStatement" && Core.isNonEmptyArray(node.body)) {
        enforceSpacingInBlock(node.body, minDeclarationRunLength);
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            visitNode(value, visitedNodes, minDeclarationRunLength);
        }
    }
}

function enforceSpacingInBlock(statements, minDeclarationRunLength) {
    let runLength = 0;

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (isVarDeclaration(statement)) {
            runLength += 1;
            continue;
        }

        if (
            runLength >= minDeclarationRunLength &&
            shouldForceBlankLineAfter(statement)
        ) {
            const lastDeclaration = statements[index - 1];
            if (
                lastDeclaration &&
                typeof lastDeclaration === "object" &&
                lastDeclaration._gmlForceFollowingEmptyLine !== true &&
                lastDeclaration._featherForceFollowingEmptyLine !== true
            ) {
                lastDeclaration._gmlForceFollowingEmptyLine = true;
            }
        }

        runLength = 0;
    }
}

function isVarDeclaration(node) {
    if (Core.getNodeType(node) !== "VariableDeclaration") {
        return false;
    }

    const { kind } = node;
    return kind === "var" || kind === "let";
}

function shouldForceBlankLineAfter(nextNode) {
    return Core.getNodeType(nextNode) === "ForStatement";
}
