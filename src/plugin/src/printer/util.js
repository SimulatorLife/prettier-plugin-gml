import { util } from "prettier";

const {
    skipNewline,
    skipSpaces,
    skipToLineEnd,
    skipInlineComment,
    skipTrailingComment,
    hasNewline
} = util;

// currently unused due to enforcement of braces
function statementShouldEndWithSemicolon(path) {
    const node = path.getValue();
    const parentNode = path.getParentNode();
    if (!parentNode) {
        return false;
    }

    // for single line control structures written in short form (i.e. without a block),
    // we need to make sure the single body node gets a semicolon
    if (
        ["ForStatement", "WhileStatement", "DoUntilStatement", "IfStatement", "SwitchStatement"].includes(
            parentNode.type
        ) &&
        node.type !== "BlockStatement" &&
        node.type !== "IfStatement" &&
        (parentNode.body === node || parentNode.alternate === node)
    ) {
        return true;
    }
    return nodeTypeNeedsSemicolon(node.type);
}

function nodeTypeNeedsSemicolon(type) {
    return [
        "CallExpression",
        "AssignmentExpression",
        "GlobalVarStatement",
        "ReturnStatement",
        "BreakStatement",
        "ContinueStatement",
        "ExitStatement",
        "ThrowStatement",
        "IncDecStatement",
        "VariableDeclaration"
    ].includes(type);
}

function isLastStatement(path) {
    const body = getParentNodeListProperty(path);
    if (!body) {
        return true;
    }
    const node = path.getValue();
    return body[body.length - 1] === node;
}

function getParentNodeListProperty(path) {
    const parent = path.getParentNode();
    if (!parent) {
        return null;
    }
    return getNodeListProperty(parent);
}

function getNodeListProperty(node) {
    const body = node.body;
    return Array.isArray(body) ? body : null;
}

function isNextLineEmpty(text, startIndex) {
    let oldIdx = null;
    let idx = startIndex;
    while (idx !== oldIdx) {
        // We need to skip all the potential trailing inline comments
        oldIdx = idx;
        idx = skipToLineEnd(text, idx);
        idx = skipInlineComment(text, idx);
        idx = skipSpaces(text, idx);
    }
    idx = skipTrailingComment(text, idx);
    idx = skipNewline(text, idx);
    return idx !== false && hasNewline(text, idx);
}

function optionalSemicolon(nodeType) {
    return nodeTypeNeedsSemicolon(nodeType) ? ";" : "";
}

function isAssignmentLikeExpression(nodeType) {
    if (!nodeType) { return false; }
    return [
        "AssignmentExpression",
        "GlobalVarStatement",
        "VariableDeclarator",
        "Property"
    ].includes(nodeType);
}

// these top-level statements are surrounded by empty lines by default
function shouldAddNewlinesAroundStatement(node, options) {
    const nodeType = node?.type;
    if (!nodeType) { return false; }
    if (
        [
            "FunctionDeclaration",
            "ConstructorDeclaration",
            "EndRegionStatement"
        ].includes(nodeType)
    ) {
        return true;
    }
    return false;
}

function hasComment(node) {
    const comments = node.comments ?? null;
    return comments && Array.isArray(comments) && comments.length > 0;
}

export {
    statementShouldEndWithSemicolon,
    isLastStatement,
    optionalSemicolon,
    isAssignmentLikeExpression,
    hasComment,
    isNextLineEmpty,
    shouldAddNewlinesAroundStatement
};