import {
    hasComment as sharedHasComment,
    getHasCommentHelper
} from "../comments/index.js";
import {
    getSingleVariableDeclarator as sharedGetSingleVariableDeclarator,
    getIdentifierText as sharedGetIdentifierText,
    isUndefinedLiteral as sharedIsUndefinedLiteral,
    getSingleMemberIndexPropertyEntry as sharedGetSingleMemberIndexPropertyEntry
} from "../../../shared/ast-node-helpers.js";

const DEFAULT_HELPERS = {
    getIdentifierText: sharedGetIdentifierText,
    isUndefinedLiteral: sharedIsUndefinedLiteral,
    getSingleVariableDeclarator: sharedGetSingleVariableDeclarator,
    hasComment: sharedHasComment
};

/**
 * @typedef {object} ArgumentCountFallbackMatch
 * @property {string} targetName Identifier on the left-hand side of the guard.
 * @property {number} argumentIndex Position in the callee's parameter list that the guard inspects.
 * @property {import("estree").Expression} fallbackExpression Expression that should become the default value.
 * @property {unknown} statementNode AST node that produced the fallback (used for clean-up once rewritten).
 */

/**
 * @typedef {object} ArgumentCountGuardResult
 * @property {number} argumentIndex Zero-based index derived from the `argument_count` comparison.
 */

/**
 * Normalize function parameters by converting `argument_count` fallbacks into default parameters.
 * This runs before printing so downstream stages can rely on the canonical default-parameter shape.
 *
 * @param {unknown} ast Any AST node or array representing a program fragment.
 * @param {{
 *   getIdentifierText?: (node: unknown) => string | null,
 *   isUndefinedLiteral?: (node: unknown) => boolean,
 *   getSingleVariableDeclarator?: (node: unknown) => unknown,
 *   hasComment?: (node: unknown) => boolean
 * }} helpers
 * @returns {unknown} The original AST reference so callers can chain transformations.
 */
export function preprocessFunctionArgumentDefaults(
    ast,
    helpers = DEFAULT_HELPERS
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const normalizedHelpers = {
        getIdentifierText:
            typeof helpers.getIdentifierText === "function"
                ? helpers.getIdentifierText
                : DEFAULT_HELPERS.getIdentifierText,
        isUndefinedLiteral:
            typeof helpers.isUndefinedLiteral === "function"
                ? helpers.isUndefinedLiteral
                : DEFAULT_HELPERS.isUndefinedLiteral,
        getSingleVariableDeclarator:
            typeof helpers.getSingleVariableDeclarator === "function"
                ? helpers.getSingleVariableDeclarator
                : DEFAULT_HELPERS.getSingleVariableDeclarator,
        hasComment: getHasCommentHelper(helpers)
    };

    traverse(ast, (node) => {
        if (!node || node.type !== "FunctionDeclaration") {
            return;
        }

        preprocessFunctionDeclaration(node, normalizedHelpers);
    });

    return ast;
}

/**
 * Depth-first traversal that tolerates parent pointers and other cycles.
 * The traversal only recurses into object-valued properties to avoid
 * coercing primitives into wrapper objects.
 *
 * @param {unknown} node Root node to visit.
 * @param {(node: unknown) => void} visitor Callback invoked for every object node.
 * @param {Set<object>} [seen]
 *        Optional accumulator used to de-duplicate visited objects between recursive calls.
 * @returns {void}
 */
function traverse(node, visitor, seen = new Set()) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (seen.has(node)) {
        return;
    }

    seen.add(node);

    if (Array.isArray(node)) {
        for (const child of node) {
            traverse(child, visitor, seen);
        }
        return;
    }

    visitor(node);

    for (const [key, value] of Object.entries(node)) {
        if (key === "parent") {
            continue;
        }

        if (value && typeof value === "object") {
            traverse(value, visitor, seen);
        }
    }
}

/**
 * Converts legacy `argument_count` fallbacks within a single declaration into
 * default parameters where possible. Mutates the declaration in-place.
 *
 * @param {unknown} node Candidate function declaration.
 * @param {typeof DEFAULT_HELPERS} helpers Normalized helper bag used by the outer transform.
 * @returns {void}
 */
function preprocessFunctionDeclaration(node, helpers) {
    if (!node || node.type !== "FunctionDeclaration") {
        return;
    }

    if (node._hasProcessedArgumentCountDefaults) {
        return;
    }

    const {
        getIdentifierText,
        isUndefinedLiteral,
        hasComment,
        getSingleVariableDeclarator
    } = helpers;

    if (
        typeof getIdentifierText !== "function" ||
        typeof isUndefinedLiteral !== "function" ||
        typeof hasComment !== "function" ||
        typeof getSingleVariableDeclarator !== "function"
    ) {
        return;
    }

    node._hasProcessedArgumentCountDefaults = true;

    const body = node.body;
    if (
        !body ||
        body.type !== "BlockStatement" ||
        !Array.isArray(body.body) ||
        body.body.length === 0
    ) {
        return;
    }

    const statements = body.body;
    const matches = [];

    for (const [statementIndex, statement] of statements.entries()) {
        const match = matchArgumentCountFallbackStatement(statement, helpers);

        if (!match) {
            continue;
        }

        matches.push({
            ...match,
            statementIndex
        });
    }

    if (matches.length === 0) {
        return;
    }

    matches.sort((a, b) => {
        if (a.argumentIndex !== b.argumentIndex) {
            return a.argumentIndex - b.argumentIndex;
        }

        return a.statementIndex - b.statementIndex;
    });

    const params = Array.isArray(node.params) ? node.params : [];
    if (!Array.isArray(node.params)) {
        node.params = params;
    }

    const paramInfoByName = new Map();
    for (const [index, param] of params.entries()) {
        const identifier = getIdentifierFromParameter(param, helpers);
        if (!identifier) {
            continue;
        }

        const name = getIdentifierText(identifier);
        if (!name) {
            continue;
        }

        paramInfoByName.set(name, { index, identifier });
    }

    const statementsToRemove = new Set();
    let appliedChanges = false;

    const ensureParameterInfoForMatch = (match) => {
        if (!match) {
            return null;
        }

        const { targetName, argumentIndex } = match;
        if (argumentIndex == undefined || argumentIndex < 0) {
            return null;
        }

        const existingInfo = paramInfoByName.get(targetName);
        if (existingInfo) {
            return existingInfo.index === argumentIndex ? existingInfo : null;
        }

        if (argumentIndex > params.length) {
            return null;
        }

        const registerInfo = (index, identifier) => {
            const info = { index, identifier };
            paramInfoByName.set(targetName, info);
            return info;
        };

        if (argumentIndex === params.length) {
            const newIdentifier = {
                type: "Identifier",
                name: targetName
            };
            params.push(newIdentifier);
            return registerInfo(argumentIndex, newIdentifier);
        }

        const paramAtIndex = params[argumentIndex];
        const identifier = getIdentifierFromParameter(paramAtIndex, helpers);
        if (!identifier) {
            return null;
        }

        const identifierName = getIdentifierText(identifier);
        if (!identifierName || identifierName !== targetName) {
            return null;
        }

        return registerInfo(argumentIndex, identifier);
    };

    for (const match of matches) {
        if (!match) {
            continue;
        }

        const paramInfo = ensureParameterInfoForMatch(match);
        if (!paramInfo) {
            continue;
        }

        if (!match.fallbackExpression) {
            continue;
        }

        const currentParam = node.params[paramInfo.index];
        if (!currentParam || currentParam.type !== "Identifier") {
            continue;
        }

        const identifier = paramInfo.identifier;
        if (!identifier || identifier.type !== "Identifier") {
            continue;
        }

        node.params[paramInfo.index] = {
            type: "DefaultParameter",
            left: identifier,
            right: match.fallbackExpression
        };

        statementsToRemove.add(match.statementNode);
        paramInfoByName.delete(match.targetName);
        appliedChanges = true;

        if (match.statementNode?.type === "IfStatement") {
            const redundantVar = findRedundantVarDeclarationBefore(
                statements,
                match.statementIndex,
                match.targetName,
                helpers
            );

            if (redundantVar) {
                statementsToRemove.add(redundantVar);
            }
        }
    }

    if (!appliedChanges || statementsToRemove.size === 0) {
        return;
    }

    const filteredStatements = body.body.filter(
        (statement) => !statementsToRemove.has(statement)
    );

    delete node._suppressSyntheticReturnsDoc;
    node._flattenSyntheticNumericParens = true;
    body.body = filteredStatements;
}

/**
 * @param {unknown} param Raw parameter node.
 * @param {{ getIdentifierText: (node: unknown) => string | null }} context
 * @returns {import("estree").Identifier | null}
 */
function getIdentifierFromParameter(param, { getIdentifierText }) {
    if (!param) {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (
        param.type === "DefaultParameter" &&
        param.left?.type === "Identifier"
    ) {
        return param.left;
    }

    if (
        param.type === "ConstructorParentClause" &&
        Array.isArray(param.params)
    ) {
        for (const childParam of param.params) {
            const identifier = getIdentifierFromParameter(childParam, {
                getIdentifierText
            });
            if (identifier) {
                return identifier;
            }
        }
    }

    return null;
}

/**
 * Checks whether a statement represents an `argument_count` fallback and, if so,
 * captures the pieces needed to rewrite it as a default parameter.
 *
 * @param {unknown} statement Statement drawn from the function body.
 * @param {typeof DEFAULT_HELPERS} helpers Helper bag used to inspect nodes.
 * @returns {ArgumentCountFallbackMatch | null}
 */
function matchArgumentCountFallbackStatement(statement, helpers) {
    if (!statement) {
        return null;
    }

    if (helpers.hasComment(statement)) {
        return null;
    }

    if (statement.type === "VariableDeclaration") {
        return matchArgumentCountFallbackFromVariableDeclaration(
            statement,
            helpers
        );
    }

    if (statement.type === "IfStatement") {
        return matchArgumentCountFallbackFromIfStatement(statement, helpers);
    }

    return null;
}

/**
 * Extracts the sole declarator from `var` declarations that match the simple
 * fallback patterns handled by this transform. Callers can optionally require
 * the outer declaration node to be comment-free while the helper always
 * ensures the declarator itself has no comments.
 *
 * @param {unknown} node Candidate statement to inspect.
 * @param {typeof DEFAULT_HELPERS} helpers
 * @param {{ requireCommentFreeDeclaration?: boolean }} [options]
 * @returns {import("estree").VariableDeclarator | null}
 */
function getSimpleVarDeclarator(
    node,
    helpers,
    { requireCommentFreeDeclaration = false } = {}
) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    if (node.kind !== "var") {
        return null;
    }

    if (requireCommentFreeDeclaration && helpers.hasComment(node)) {
        return null;
    }

    const declarator = helpers.getSingleVariableDeclarator(node);
    if (!declarator) {
        return null;
    }

    if (helpers.hasComment(declarator)) {
        return null;
    }

    return declarator;
}

/**
 * Matches fallbacks of the form `var foo = argument_count > n ? argument[n] : expr;`.
 *
 * @param {unknown} node Variable declaration to inspect.
 * @param {typeof DEFAULT_HELPERS} helpers
 * @returns {ArgumentCountFallbackMatch | null}
 */
function matchArgumentCountFallbackFromVariableDeclaration(node, helpers) {
    const declarator = getSimpleVarDeclarator(node, helpers);
    if (!declarator) {
        return null;
    }

    if (!declarator.init || declarator.init.type !== "TernaryExpression") {
        return null;
    }

    const guard = parseArgumentCountGuard(declarator.init.test);
    if (!guard) {
        return null;
    }

    const consequentIsArgument = isArgumentArrayAccess(
        declarator.init.consequent,
        guard.argumentIndex
    );
    const alternateIsArgument = isArgumentArrayAccess(
        declarator.init.alternate,
        guard.argumentIndex
    );

    if (consequentIsArgument === alternateIsArgument) {
        return null;
    }

    const fallbackExpression = consequentIsArgument
        ? declarator.init.alternate
        : declarator.init.consequent;
    if (!fallbackExpression) {
        return null;
    }

    const targetName = helpers.getIdentifierText(declarator.id);
    if (!targetName) {
        return null;
    }

    return {
        targetName,
        fallbackExpression,
        argumentIndex: guard.argumentIndex,
        statementNode: node
    };
}

/**
 * Matches fallbacks encoded as an if/else guard that assigns the argument or
 * a fallback expression to the same identifier in both branches.
 *
 * @param {unknown} node IfStatement to inspect.
 * @param {typeof DEFAULT_HELPERS} helpers
 * @returns {ArgumentCountFallbackMatch | null}
 */
function matchArgumentCountFallbackFromIfStatement(node, helpers) {
    if (!node || node.type !== "IfStatement") {
        return null;
    }

    const guard = parseArgumentCountGuard(node.test);
    if (!guard) {
        return null;
    }

    const consequentAssignment = extractAssignmentFromStatement(
        node.consequent,
        helpers
    );
    const alternateAssignment = extractAssignmentFromStatement(
        node.alternate,
        helpers
    );

    if (!consequentAssignment || !alternateAssignment) {
        return null;
    }

    const consequentIsArgument = isArgumentArrayAccess(
        consequentAssignment.right,
        guard.argumentIndex
    );
    const alternateIsArgument = isArgumentArrayAccess(
        alternateAssignment.right,
        guard.argumentIndex
    );

    if (consequentIsArgument === alternateIsArgument) {
        return null;
    }

    const argumentAssignment = consequentIsArgument
        ? consequentAssignment
        : alternateAssignment;
    const fallbackAssignment = consequentIsArgument
        ? alternateAssignment
        : consequentAssignment;

    const targetName = helpers.getIdentifierText(argumentAssignment.left);
    const fallbackName = helpers.getIdentifierText(fallbackAssignment.left);

    if (!targetName || targetName !== fallbackName) {
        return null;
    }

    if (!fallbackAssignment.right) {
        return null;
    }

    return {
        targetName,
        fallbackExpression: fallbackAssignment.right,
        argumentIndex: guard.argumentIndex,
        statementNode: node
    };
}

/**
 * Finds a `var <target>;` declaration immediately preceding the fallback. These
 * declarations become redundant once the default parameter is synthesized.
 *
 * @param {unknown[]} statements Function body statements.
 * @param {number} currentIndex Index of the fallback currently being processed.
 * @param {string} targetName Identifier that receives the default value.
 * @param {typeof DEFAULT_HELPERS} helpers
 * @returns {unknown | null}
 */
function findRedundantVarDeclarationBefore(
    statements,
    currentIndex,
    targetName,
    helpers
) {
    if (!Array.isArray(statements) || currentIndex <= 0) {
        return null;
    }

    const candidate = statements[currentIndex - 1];

    if (!isStandaloneVarDeclarationForTarget(candidate, targetName, helpers)) {
        return null;
    }

    return candidate;
}

/**
 * Determines whether the provided node is a bare `var <target>;` declaration
 * with no initializer or comments that could carry semantic meaning.
 *
 * @param {unknown} node
 * @param {string} targetName
 * @param {typeof DEFAULT_HELPERS} helpers
 * @returns {boolean}
 */
function isStandaloneVarDeclarationForTarget(node, targetName, helpers) {
    const declarator = getSimpleVarDeclarator(node, helpers, {
        requireCommentFreeDeclaration: true
    });
    if (!declarator) {
        return false;
    }

    const declaratorName = helpers.getIdentifierText(declarator.id);

    if (!declaratorName || declaratorName !== targetName) {
        return false;
    }

    if (declarator.init && !helpers.isUndefinedLiteral(declarator.init)) {
        return false;
    }

    return true;
}

/**
 * Extracts the underlying assignment expression from a statement wrapper
 * (expression statement or one-line block). Returns `null` for non-identifer
 * assignments, which ensures callers only rewrite simple `foo = ...` shapes.
 *
 * @param {unknown} statement
 * @param {typeof DEFAULT_HELPERS} helpers
 * @returns {import("estree").AssignmentExpression | null}
 */
function extractAssignmentFromStatement(statement, helpers) {
    if (!statement) {
        return null;
    }

    if (helpers.hasComment(statement)) {
        return null;
    }

    if (statement.type === "AssignmentExpression") {
        return statement;
    }

    if (statement.type === "BlockStatement") {
        if (!Array.isArray(statement.body) || statement.body.length !== 1) {
            return null;
        }
        return extractAssignmentFromStatement(statement.body[0], helpers);
    }

    if (statement.type !== "ExpressionStatement") {
        return null;
    }

    const expression = statement.expression;
    if (!expression || expression.type !== "AssignmentExpression") {
        return null;
    }

    if (expression.operator !== "=") {
        return null;
    }

    if (!expression.left || expression.left.type !== "Identifier") {
        return null;
    }

    return expression;
}

/**
 * Parses the conditional guard wrapped around `argument_count` checks. Only
 * simple comparisons that uniquely point at a parameter index are supported;
 * other operators are ignored so we do not misinterpret complex control flow.
 *
 * @param {unknown} node Expression used in the guard.
 * @returns {ArgumentCountGuardResult | null}
 */
function parseArgumentCountGuard(node) {
    if (!node) {
        return null;
    }

    if (node.type === "ParenthesizedExpression") {
        return parseArgumentCountGuard(node.expression);
    }

    if (node.type !== "BinaryExpression") {
        return null;
    }

    const left = node.left;
    if (!left || left.type !== "Identifier" || left.name !== "argument_count") {
        return null;
    }

    const rightIndex = parseArgumentIndexValue(node.right);
    if (rightIndex === null) {
        return null;
    }

    let argumentIndex = rightIndex;

    switch (node.operator) {
        case ">=":
        case "<": {
            argumentIndex -= 1;
            break;
        }
        case ">":
        case "<=":
        case "==":
        case "!=": {
            break;
        }
        default: {
            return null;
        }
    }

    return argumentIndex >= 0 ? { argumentIndex } : null;
}

/**
 * Extracts a numeric index from a literal or unary expression. The function is
 * intentionally strict so that approximate matches (e.g. non-integers) do not
 * get rewritten.
 *
 * @param {unknown} node Potential index expression.
 * @returns {number | null}
 */
function parseArgumentIndexValue(node) {
    if (!node) {
        return null;
    }

    if (node.type === "ParenthesizedExpression") {
        return parseArgumentIndexValue(node.expression);
    }

    if (node.type === "UnaryExpression") {
        if (node.operator !== "+" && node.operator !== "-") {
            return null;
        }

        const argumentValue = parseArgumentIndexValue(node.argument);

        if (argumentValue === null) {
            return null;
        }

        return node.operator === "-" ? -argumentValue : argumentValue;
    }

    if (node.type === "Literal") {
        if (typeof node.value === "number" && Number.isInteger(node.value)) {
            return node.value;
        }

        if (typeof node.value === "string") {
            const numeric = Number.parseInt(node.value, 10);
            if (!Number.isNaN(numeric)) {
                return numeric;
            }
        }
    }

    return null;
}

/**
 * Checks whether a node reads `argument[<index>]` with a resolvable index.
 *
 * @param {unknown} node
 * @param {number} expectedIndex
 * @returns {boolean}
 */
function isArgumentArrayAccess(node, expectedIndex) {
    if (!node || node.type !== "MemberIndexExpression") {
        return false;
    }

    if (
        !node.object ||
        node.object.type !== "Identifier" ||
        node.object.name !== "argument"
    ) {
        return false;
    }

    const propertyEntry = sharedGetSingleMemberIndexPropertyEntry(node);
    if (!propertyEntry) {
        return false;
    }

    const actualIndex = parseArgumentIndexValue(propertyEntry);
    if (actualIndex === null) {
        return false;
    }

    return actualIndex === expectedIndex;
}
