import {
    getNormalizedDefineReplacementDirective,
    isFunctionLikeDeclaration
} from "./util.js";
import { getBooleanLiteralValue } from "../shared/index.js";

function isMacroLikeStatement(node) {
    const nodeType = node?.type;
    if (!nodeType) {
        return false;
    }

    if (nodeType === "MacroDeclaration") {
        return true;
    }

    if (nodeType === "DefineStatement") {
        return getNormalizedDefineReplacementDirective(node) === "#macro";
    }

    return false;
}

function shouldSuppressEmptyLineBetween(previousNode, nextNode) {
    return isMacroLikeStatement(previousNode) && isMacroLikeStatement(nextNode);
}

function shouldForceTrailingBlankLineForNestedFunction(
    node,
    blockNode,
    containerNode
) {
    if (!isFunctionLikeDeclaration(node)) {
        return false;
    }

    if (!blockNode || blockNode.type !== "BlockStatement") {
        return false;
    }

    return isFunctionLikeDeclaration(containerNode);
}

/**
 * Require a blank line between a guard-style `if` statement and the
 * following `return` when the branch returns the opposite boolean literal.
 *
 * The spacing makes early-return fallbacks easier to scan by visually
 * separating the "happy path" (`return true;`) from the "bail out"
 * (`return false;`) logic. The policy only triggers when the `if` statement
 * ends with a single `return` inside its block and the next sibling is a
 * `ReturnStatement` with the opposing boolean literal. Mixed argument types
 * or multi-statement branches opt out so existing formatting remains
 * untouched.
 *
 * @param {unknown} currentNode Candidate `IfStatement` node to inspect.
 * @param {unknown} nextNode Statement that follows {@link currentNode}.
 * @returns {boolean} `true` when the printer should inject a blank line
 *                    between the statements.
 */
function shouldForceBlankLineBetweenReturnPaths(currentNode, nextNode) {
    if (!currentNode || currentNode.type !== "IfStatement") {
        return false;
    }

    if (!nextNode || nextNode.type !== "ReturnStatement") {
        return false;
    }

    if (currentNode.alternate) {
        return false;
    }

    const blockBody = currentNode.consequent?.body;
    if (!Array.isArray(blockBody)) {
        return false;
    }

    const lastStatement = blockBody.findLast(Boolean);
    if (!lastStatement || lastStatement.type !== "ReturnStatement") {
        return false;
    }

    const consequentBoolean = getBooleanLiteralValue(lastStatement.argument);
    const fallbackBoolean = getBooleanLiteralValue(nextNode.argument);

    if (consequentBoolean === null || fallbackBoolean === null) {
        return false;
    }

    return consequentBoolean !== fallbackBoolean;
}

export {
    isMacroLikeStatement,
    shouldForceBlankLineBetweenReturnPaths,
    shouldForceTrailingBlankLineForNestedFunction,
    shouldSuppressEmptyLineBetween
};
