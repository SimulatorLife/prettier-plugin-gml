import { Core } from "@gml-modules/core";

// The printer hits this helper in hot loops, so prefer a switch statement over
// re-allocating arrays on every call (see PR #110 micro-benchmark in commit
// message). These top-level statements are surrounded by empty lines by
// default.
const DEFAULT_NODE_TYPES_WITH_SURROUNDING_NEWLINES = Object.freeze([
    "FunctionDeclaration",
    "ConstructorDeclaration",
    "RegionStatement",
    "EndRegionStatement"
]);

const nodeTypesWithSurroundingNewlines = new Set();

/**
 * Allow internal consumers to register additional statement node type names
 * that should be padded with surrounding blank lines. The hook keeps the
 * formatter opinionated by seeding the registry with
 * {@link DEFAULT_NODE_TYPES_WITH_SURROUNDING_NEWLINES} and only accepting
 * string inputs, so external Prettier users keep the existing behavior unless
 * the plugin opts into more spacing internally. Invalid values (including
 * `null`, `undefined`, or whitespace-only strings) are ignored to keep the hot
 * path predictable.
 *
 * @param {...string | Array<string>} nodeTypes Additional node type names to
 *        register.
 */
function registerSurroundingNewlineNodeTypes(...nodeTypes) {
    for (const entry of nodeTypes) {
        if (Array.isArray(entry)) {
            registerSurroundingNewlineNodeTypes(...entry);
            continue;
        }

        const normalized = Core.getNonEmptyTrimmedString(entry);
        if (!normalized) {
            continue;
        }

        nodeTypesWithSurroundingNewlines.add(normalized);
    }
}

/**
 * Reset the newline padding registry back to the defaults. This keeps tests
 * and experiments isolated while preserving the plugin's baseline formatting
 * when no extensions are registered.
 */
function resetSurroundingNewlineNodeTypes() {
    nodeTypesWithSurroundingNewlines.clear();
    for (const type of DEFAULT_NODE_TYPES_WITH_SURROUNDING_NEWLINES) {
        nodeTypesWithSurroundingNewlines.add(type);
    }
}

resetSurroundingNewlineNodeTypes();

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
        directive === Core.DefineReplacementDirective.REGION ||
        directive === Core.DefineReplacementDirective.END_REGION
    );
}

/**
 * Determines whether a statement should be surrounded by blank lines in the
 * generated doc tree.
 *
 * Statements listed in {@link DEFAULT_NODE_TYPES_WITH_SURROUNDING_NEWLINES}
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

    // Avoid allocating an array for every call by reusing a Set that is created
    // once when the module is evaluated. This helper runs inside the printer's
    // statement loops, so trading `Array.includes` for a simple Set membership
    // check keeps the hot path allocation-free and branch-predictable.
    if (nodeTypesWithSurroundingNewlines.has(nodeType)) {
        return true;
    }

    return defineReplacementRequiresNewlines(node);
}

function shouldSuppressEmptyLineBetween(previousNode, nextNode) {
    return (
        Core.isMacroLikeStatement(previousNode) &&
        Core.isMacroLikeStatement(nextNode)
    );
}

function shouldForceTrailingBlankLineForNestedFunction(
    node,
    blockNode,
    containerNode
) {
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

    // Iterate manually instead of using `Array#findLast` so the printer avoids
    // invoking a callback for every statement while scanning hot blocks.
    let lastStatement = null;
    for (let index = blockBody.length - 1; index >= 0; index -= 1) {
        const candidate = blockBody[index];
        if (candidate) {
            lastStatement = candidate;
            break;
        }
    }

    if (!lastStatement || lastStatement.type !== "ReturnStatement") {
        return false;
    }

    const consequentBoolean = Core.getBooleanLiteralValue(
        lastStatement.argument
    );
    const fallbackBoolean = Core.getBooleanLiteralValue(nextNode.argument);

    if (consequentBoolean === null || fallbackBoolean === null) {
        return false;
    }

    return consequentBoolean !== fallbackBoolean;
}

export {
    registerSurroundingNewlineNodeTypes,
    resetSurroundingNewlineNodeTypes,
    shouldAddNewlinesAroundStatement,
    shouldForceBlankLineBetweenReturnPaths,
    shouldForceTrailingBlankLineForNestedFunction,
    shouldSuppressEmptyLineBetween
};
