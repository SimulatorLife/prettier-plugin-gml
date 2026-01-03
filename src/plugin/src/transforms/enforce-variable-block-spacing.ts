/**
 * Enforces blank lines after long runs of variable declarations so the printer emits consistently spaced blocks.
 * The rule triggers after a minimum number of declarations and only inserts spacing before `for` loops.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { createParserTransform, type EmptyTransformOptions } from "./functional-transform.js";

// Enforce consistent spacing after variable blocks without exposing user
// configuration. GameMaker projects commonly group multiple variable declarations
// together (e.g., initializing loop counters, caching references, or setting up
// state). After four or more consecutive declarations, the formatter inserts a
// blank line before the next statement (currently limited to `for` loops) to
// visually separate the initialization block from control flow. Making this
// threshold configurable would fragment formatting conventions across projects
// and increase maintenance burden—teams would need to negotiate and document
// the "right" threshold, and diffs would become harder to review when
// contributors use different settings. By hardcoding the value, we ensure all
// GML code formatted by this plugin follows the same spacing discipline,
// aligning with the opinionated formatter philosophy.
const MIN_DECLARATIONS = 4;

/**
 * Entry point that walks the AST once to add the `_gmlForceFollowingEmptyLine` hint.
 */
function execute(ast: MutableGameMakerAstNode): MutableGameMakerAstNode {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const visitedNodes = new WeakSet();

    visitNode(ast, visitedNodes, MIN_DECLARATIONS);
    return ast;
}

/**
 * Depth-first walker that tracks declaration runs inside block statements.
 */
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

/**
 * Mark the final declaration of a long run so the printer will insert an empty line after it.
 */
function enforceSpacingInBlock(statements, minDeclarationRunLength) {
    let runLength = 0;

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (isVarDeclaration(statement)) {
            runLength += 1;
            continue;
        }

        if (runLength >= minDeclarationRunLength && shouldForceBlankLineAfter(statement)) {
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
function isVarDeclaration(node) {
    if (Core.getNodeType(node) !== "VariableDeclaration") {
        return false;
    }

    const { kind } = node;
    return kind === "var" || kind === "let";
}

/**
 * Only force spacing when the following statement is a `for` loop so spacing stays predictable.
 */
function shouldForceBlankLineAfter(nextNode) {
    return Core.getNodeType(nextNode) === "ForStatement";
}

export const enforceVariableBlockSpacingTransform = createParserTransform<EmptyTransformOptions>(
    "enforce-variable-block-spacing",
    {},
    execute
);
