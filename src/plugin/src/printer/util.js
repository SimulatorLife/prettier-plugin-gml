import { util } from "prettier";
import { getNodeType, toTrimmedString } from "../shared/index.js";

const { isNextLineEmpty, isPreviousLineEmpty } = util;

// Using a Set avoids re-allocating the list for every membership check when
// these helpers run inside tight printer loops.
const NODE_TYPES_REQUIRING_SEMICOLON = new Set([
    "CallExpression",
    "AssignmentExpression",
    "ExpressionStatement",
    "GlobalVarStatement",
    "ReturnStatement",
    "BreakStatement",
    "ContinueStatement",
    "ExitStatement",
    "ThrowStatement",
    "IncDecStatement",
    "VariableDeclaration",
    "DeleteStatement"
]);

/**
 * Guard helper for {@link optionalSemicolon} to keep the membership logic
 * centralized. The printer ends up consulting this list in several hot paths,
 * so caching the lookup in a `Set` keeps call sites tidy without introducing
 * repeated allocations.
 *
 * @param {string | undefined} type Node `type` value to evaluate.
 * @returns {boolean} `true` when the node type must be terminated with a
 *                    semicolon.
 */
function nodeTypeNeedsSemicolon(type) {
    return NODE_TYPES_REQUIRING_SEMICOLON.has(type);
}

/**
 * Determine whether the current AST path points to the final statement within
 * its parent's body array. The printer uses this to decide when it can omit
 * trailing semicolons or blank lines without peeking outside the current
 * subtree.
 *
 * @param {import("prettier").AstPath} path AST path for the node being printed.
 * @returns {boolean} `true` when the node is the last statement in its parent.
 */
function isLastStatement(path) {
    const body = getParentNodeListProperty(path);
    if (!body) {
        return true;
    }
    const node = path.getValue();

    // `Array#at` supports negative indices but pays an extra bounds check on
    // every call. The printer hits this helper for nearly every statement
    // emission, so using direct index math keeps the hot path leaner while
    // preserving the existing semantics for empty arrays.
    const lastIndex = body.length - 1;
    return lastIndex >= 0 && body[lastIndex] === node;
}

/**
 * Walk up the AST path and return the parent's `body` array when present. The
 * printer cares primarily about statement order, so failing closed (`null`)
 * keeps consumers from accidentally iterating non-array structures.
 *
 * @param {import("prettier").AstPath} path Current AST path within the
 *        printer traversal.
 * @returns {Array<unknown> | null} Parent body array or `null` when the parent
 *          does not expose a list-like `body` property.
 */
function getParentNodeListProperty(path) {
    const parent = path.getParentNode();
    if (!parent) {
        return null;
    }
    return getNodeListProperty(parent);
}

/**
 * Normalizes the `body` property lookup used throughout the printer so callers
 * can treat list-bearing nodes uniformly. Returning `null` for non-arrays keeps
 * the guard symmetric with {@link getParentNodeListProperty}.
 *
 * @param {unknown} node Candidate AST node to inspect.
 * @returns {Array<unknown> | null} `body` array when present, otherwise `null`.
 */
function getNodeListProperty(node) {
    const body = node.body;
    return Array.isArray(body) ? body : null;
}

/**
 * Convenience wrapper that returns the semicolon literal only when the printer
 * recognizes the node type as statement-terminating. Returning an empty string
 * avoids conditional logic at each call site and keeps the control flow easy to
 * scan within template literal builders.
 *
 * @param {string | undefined} nodeType AST node `type` to evaluate.
 * @returns {"" | ";"} Semicolon string when required, otherwise an empty string.
 */
function optionalSemicolon(nodeType) {
    return nodeTypeNeedsSemicolon(nodeType) ? ";" : "";
}

// The printer hits this helper in hot loops, so prefer a switch statement over
// re-allocating arrays on every call (see PR #110 micro-benchmark in commit
// message).
// These top-level statements are surrounded by empty lines by default.
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

        if (typeof entry !== "string") {
            continue;
        }

        const normalized = entry.trim();
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

// Function-like declarations appear throughout the printer when deciding how
// aggressively to pad nested constructs. Consolidate the shared guard so
// spacing rules and traversal helpers continue to agree on which nodes count
// as functions without repeating the defensive shape checks.
const FUNCTION_LIKE_DECLARATION_TYPES = new Set([
    "FunctionDeclaration",
    "ConstructorDeclaration",
    "FunctionExpression"
]);

/**
 * Detects nodes that behave like functions for spacing and traversal purposes.
 * The printer needs to align its heuristics with comment attachment and region
 * padding rules, so centralizing the guard prevents drift between modules.
 *
 * @param {unknown} node Candidate AST node to inspect.
 * @returns {boolean} `true` when the node is a function-like declaration.
 */
function isFunctionLikeDeclaration(node) {
    const type = getNodeType(node);
    return type !== null && FUNCTION_LIKE_DECLARATION_TYPES.has(type);
}

/**
 * Normalizes the `replacementDirective` field on define statements so the
 * printer can reason about region-like directives with case-insensitive
 * comparisons.
 *
 * @param {unknown} node Candidate AST node to inspect.
 * @returns {string | null} Lower-cased directive text when present, otherwise
 *                          `null`.
 */
function getNormalizedDefineReplacementDirective(node) {
    if (!node || node.type !== "DefineStatement") {
        return null;
    }

    const directive = toTrimmedString(node.replacementDirective);
    return directive ? directive.toLowerCase() : null;
}

/**
 * Detects define statements that emulate region boundaries and therefore need
 * the same spacing treatment as dedicated region statements.
 *
 * @param {unknown} node Candidate AST node.
 * @returns {boolean} `true` when the directive mirrors a region boundary.
 */
function defineReplacementRequiresNewlines(node) {
    const directive = getNormalizedDefineReplacementDirective(node);

    return directive === "#region" || directive === "#endregion";
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

export {
    isLastStatement,
    optionalSemicolon,
    getNormalizedDefineReplacementDirective,
    isNextLineEmpty,
    isPreviousLineEmpty,
    shouldAddNewlinesAroundStatement,
    registerSurroundingNewlineNodeTypes,
    resetSurroundingNewlineNodeTypes,
    isFunctionLikeDeclaration
};
export { hasComment } from "../comments/index.js";
