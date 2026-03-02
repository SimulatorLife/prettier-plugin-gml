import { Core } from "@gml-modules/core";

// Statement node types that require surrounding blank lines in the printed
// output. Using a Set gives O(1) lookups without any per-call allocation.
const NODE_TYPES_WITH_SURROUNDING_NEWLINES = new Set([
    "FunctionDeclaration",
    "ConstructorDeclaration",
    "RegionStatement",
    "EndRegionStatement"
]);

/**
 * Detects define statements that emulate region boundaries and therefore need
 * the same spacing treatment as dedicated region statements.
 *
 * @param {unknown} node Candidate AST node.
 * @returns {boolean} `true` when the directive mirrors a region boundary.
 */
function defineReplacementRequiresNewlines(node) {
    const directive = Core.getNormalizedDefineReplacementDirective(node);

    return (
        directive === Core.DefineReplacementDirective.REGION || directive === Core.DefineReplacementDirective.END_REGION
    );
}

/**
 * Determines whether a statement should be surrounded by blank lines in the
 * generated doc tree.
 *
 * Statements listed in {@link NODE_TYPES_WITH_SURROUNDING_NEWLINES}
 * receive padding to keep large constructs readable. The `#region` and
 * `#endregion` define replacements behave like their dedicated statement
 * counterparts, so they are treated the same even though they originate from a
 * `DefineStatement`. All other nodes default to `false` so the printer never
 * invents extra whitespace for unrecognized statement kinds.
 *
 * @param {unknown} node Statement node to inspect.
 * @returns {boolean} `true` when the printer should emit surrounding
 *                    newlines.
 */
function shouldAddNewlinesAroundStatement(node) {
    const nodeType = node?.type;
    if (!nodeType) {
        return false;
    }

    if (NODE_TYPES_WITH_SURROUNDING_NEWLINES.has(nodeType)) {
        return true;
    }

    return defineReplacementRequiresNewlines(node);
}

function shouldSuppressEmptyLineBetween(previousNode, nextNode) {
    return Core.isMacroLikeStatement(previousNode) && Core.isMacroLikeStatement(nextNode);
}

function shouldForceTrailingBlankLineForNestedFunction(node, blockNode, containerNode) {
    if (!Core.isFunctionLikeDeclaration(node)) {
        return false;
    }

    if (!blockNode || blockNode.type !== "BlockStatement") {
        return false;
    }

    return Core.isFunctionLikeDeclaration(containerNode);
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

    const lastStatement = blockBody.at(-1);

    if (!lastStatement || lastStatement.type !== "ReturnStatement") {
        return false;
    }

    const consequentBoolean = Core.getBooleanLiteralValue(lastStatement.argument);
    const fallbackBoolean = Core.getBooleanLiteralValue(nextNode.argument);

    if (consequentBoolean === null || fallbackBoolean === null) {
        return false;
    }

    return consequentBoolean !== fallbackBoolean;
}

export {
    shouldAddNewlinesAroundStatement,
    shouldForceBlankLineBetweenReturnPaths,
    shouldForceTrailingBlankLineForNestedFunction,
    shouldSuppressEmptyLineBetween
};
