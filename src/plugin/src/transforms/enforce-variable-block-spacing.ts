import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import {
    FunctionalParserTransform,
    type EmptyTransformOptions
} from "./functional-transform.js";

const MIN_DECLARATIONS = 4; // Keep this opinionated and not configurable for consistent formatting behavior

export class EnforceVariableBlockSpacingTransform extends FunctionalParserTransform<EmptyTransformOptions> {
    constructor() {
        super("enforce-variable-block-spacing", {});
    }

    protected execute(ast: MutableGameMakerAstNode): MutableGameMakerAstNode {
        if (!ast || typeof ast !== "object") {
            return ast;
        }

        const visitedNodes = new WeakSet();

        this.visitNode(ast, visitedNodes, MIN_DECLARATIONS);
        return ast;
    }

    private visitNode(node, visitedNodes, minDeclarationRunLength) {
        if (!node || typeof node !== "object") {
            return;
        }

        if (visitedNodes.has(node)) {
            return;
        }

        visitedNodes.add(node);

        if (Array.isArray(node)) {
            for (const entry of node) {
                this.visitNode(entry, visitedNodes, minDeclarationRunLength);
            }
            return;
        }

        if (node.type === "BlockStatement" && Core.isNonEmptyArray(node.body)) {
            this.enforceSpacingInBlock(node.body, minDeclarationRunLength);
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                this.visitNode(value, visitedNodes, minDeclarationRunLength);
            }
        }
    }

    private enforceSpacingInBlock(statements, minDeclarationRunLength) {
        let runLength = 0;

        for (let index = 0; index < statements.length; index += 1) {
            const statement = statements[index];

            if (this.isVarDeclaration(statement)) {
                runLength += 1;
                continue;
            }

            if (
                runLength >= minDeclarationRunLength &&
                this.shouldForceBlankLineAfter(statement)
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

    private isVarDeclaration(node) {
        if (Core.getNodeType(node) !== "VariableDeclaration") {
            return false;
        }

        const { kind } = node;
        return kind === "var" || kind === "let";
    }

    private shouldForceBlankLineAfter(nextNode) {
        return Core.getNodeType(nextNode) === "ForStatement";
    }
}

export const enforceVariableBlockSpacingTransform =
    new EnforceVariableBlockSpacingTransform();

