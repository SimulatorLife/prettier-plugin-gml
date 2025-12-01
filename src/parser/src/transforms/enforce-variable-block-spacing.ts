import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";
import { resolveVariableBlockSpacingMinDeclarations } from "../options/variable-block-spacing-options.js";

type EnforceVariableBlockSpacingTransformOptions = {
    variableBlockSpacingMinDeclarations?: number;
};

class EnforceVariableBlockSpacingTransform extends FunctionalParserTransform<EnforceVariableBlockSpacingTransformOptions> {
    constructor() {
        super("enforce-variable-block-spacing", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        options: EnforceVariableBlockSpacingTransformOptions
    ): MutableGameMakerAstNode {
        if (!ast || typeof ast !== "object") {
            return ast;
        }

        const visitedNodes = new WeakSet();
        const minDeclarationRunLength =
            resolveVariableBlockSpacingMinDeclarations(options);

        visitNode(ast, visitedNodes, minDeclarationRunLength);
        return ast;
    }
}

const enforceVariableBlockSpacingTransform =
    new EnforceVariableBlockSpacingTransform();

export function enforceVariableBlockSpacing(
    ast: MutableGameMakerAstNode,
    options: EnforceVariableBlockSpacingTransformOptions = {}
) {
    return enforceVariableBlockSpacingTransform.transform(ast, options);
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
