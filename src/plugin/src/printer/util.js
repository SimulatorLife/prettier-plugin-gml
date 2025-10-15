import { util } from "prettier";
import { toTrimmedString } from "../../../shared/string-utils.js";

const { isNextLineEmpty, isPreviousLineEmpty } = util;

// Using a Set avoids re-allocating the list for every membership check when
// these helpers run inside tight printer loops.
const NODE_TYPES_REQUIRING_SEMICOLON = new Set([
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
]);

function nodeTypeNeedsSemicolon(type) {
    return NODE_TYPES_REQUIRING_SEMICOLON.has(type);
}

function isLastStatement(path) {
    const body = getParentNodeListProperty(path);
    if (!body) {
        return true;
    }
    const node = path.getValue();
    return body.at(-1) === node;
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

function optionalSemicolon(nodeType) {
    return nodeTypeNeedsSemicolon(nodeType) ? ";" : "";
}

// The printer hits this helper in hot loops, so prefer a switch statement over
// re-allocating arrays on every call (see PR #110 micro-benchmark in commit
// message).
// These top-level statements are surrounded by empty lines by default.
const NODE_TYPES_WITH_SURROUNDING_NEWLINES = new Set([
    "FunctionDeclaration",
    "ConstructorDeclaration",
    "RegionStatement",
    "EndRegionStatement"
]);

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
 * Statements listed in {@link NODE_TYPES_WITH_SURROUNDING_NEWLINES} always
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
    if (NODE_TYPES_WITH_SURROUNDING_NEWLINES.has(nodeType)) {
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
    shouldAddNewlinesAroundStatement
};
export { hasComment } from "../comments/index.js";
