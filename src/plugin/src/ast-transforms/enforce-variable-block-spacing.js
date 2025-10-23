import { isNonEmptyArray } from "../../../shared/array-utils.js";

const MIN_DECLARATION_RUN_LENGTH = 4;

export function enforceVariableBlockSpacing(ast) {
    if (!ast || typeof ast !== "object") {
        return;
    }

    const visitedNodes = new WeakSet();
    visitNode(ast, visitedNodes);
}

function visitNode(node, visitedNodes) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (visitedNodes.has(node)) {
        return;
    }

    visitedNodes.add(node);

    if (Array.isArray(node)) {
        for (const entry of node) {
            visitNode(entry, visitedNodes);
        }
        return;
    }

    if (node.type === "BlockStatement" && isNonEmptyArray(node.body)) {
        enforceSpacingInBlock(node.body);
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            visitNode(value, visitedNodes);
        }
    }
}

function enforceSpacingInBlock(statements) {
    let runLength = 0;

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (isVarDeclaration(statement)) {
            runLength += 1;
            continue;
        }

        if (
            runLength >= MIN_DECLARATION_RUN_LENGTH &&
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
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type !== "VariableDeclaration") {
        return false;
    }

    return node.kind === "var" || node.kind === "let";
}

function shouldForceBlankLineAfter(nextNode) {
    if (!nextNode || typeof nextNode !== "object") {
        return false;
    }

    return nextNode.type === "ForStatement";
}
