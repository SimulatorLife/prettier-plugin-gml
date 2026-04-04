import { Core } from "@gmloop/core";

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
 * the formatter opts into more spacing internally. Invalid values (including
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
 * and experiments isolated while preserving the formatter's baseline formatting
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
        directive === Core.DefineReplacementDirective.REGION || directive === Core.DefineReplacementDirective.END_REGION
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

    // Reuse a module-scoped Set (created once during module evaluation) instead of
    // allocating a fresh Array on every call, since `shouldAddNewlinesAroundStatement`
    // runs inside the printer's core statement loop and is invoked thousands of times
    // per file. Trading `Array.includes` for a Set membership check yields two wins:
    //   1. No per-call allocation overhead (Array construction and population).
    //   2. O(1) average-case lookup complexity instead of O(n) linear scan.
    // This keeps the hot path allocation-free and branch-predictable, which matters
    // because the formatter spends a measurable fraction of its runtime deciding
    // whether to inject blank lines between consecutive statements. The Set is
    // immutable after module load, so there's no risk of concurrent modification or
    // stale data—it's purely a performance optimization that avoids penalizing the
    // common case where most statements don't require surrounding newlines.
    if (nodeTypesWithSurroundingNewlines.has(nodeType)) {
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

    if (!Core.isFunctionLikeDeclaration(containerNode)) {
        return false;
    }

    // Trailing nested function declarations should close adjacent to their
    // parent block terminator. Separation between statements is handled in the
    // intermediate spacing path instead.
    return false;
}

export {
    registerSurroundingNewlineNodeTypes,
    resetSurroundingNewlineNodeTypes,
    shouldAddNewlinesAroundStatement,
    shouldForceTrailingBlankLineForNestedFunction,
    shouldSuppressEmptyLineBetween
};
