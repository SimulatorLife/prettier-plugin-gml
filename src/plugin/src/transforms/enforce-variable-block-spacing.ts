/**
 * Enforces blank lines after long runs of variable declarations so the printer emits consistently spaced blocks.
 * The rule triggers after a minimum number of declarations and only inserts spacing before `for` loops.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import {
    FunctionalParserTransform,
    type EmptyTransformOptions
} from "./functional-transform.js";

const MIN_DECLARATIONS = 4; // Keep this opinionated and not configurable for consistent formatting behavior

/**
 * Transform orchestrating the spacing rule for variable declaration blocks.
 */
export class EnforceVariableBlockSpacingTransform extends FunctionalParserTransform<EmptyTransformOptions> {
    constructor() {
        super("enforce-variable-block-spacing", {});
    }

    /**
     * Entry point that walks the AST once to add the `_gmlForceFollowingEmptyLine` hint.
     */
    protected execute(ast: MutableGameMakerAstNode): MutableGameMakerAstNode {
        if (!ast || typeof ast !== "object") {
            return ast;
        }

        const visitedNodes = new WeakSet();

        this.visitNode(ast, visitedNodes, MIN_DECLARATIONS);
        return ast;
    }

    /**
     * Depth-first walker that tracks declaration runs inside block statements.
     */
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

    /**
     * Mark the final declaration of a long run so the printer will insert an empty line after it.
     */
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

    /**
     * Identify `var`/`let` declarations that contribute to the run length.
     */
    private isVarDeclaration(node) {
        if (Core.getNodeType(node) !== "VariableDeclaration") {
            return false;
        }

        const { kind } = node;
        return kind === "var" || kind === "let";
    }

    /**
     * Only force spacing when the following statement is a `for` loop so spacing stays predictable.
     */
    private shouldForceBlankLineAfter(nextNode) {
        return Core.getNodeType(nextNode) === "ForStatement";
    }
}

export const enforceVariableBlockSpacingTransform =
    new EnforceVariableBlockSpacingTransform();
