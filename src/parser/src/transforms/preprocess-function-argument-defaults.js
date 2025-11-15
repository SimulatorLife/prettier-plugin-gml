import { Core } from "@gml-modules/core";
const { hasComment: sharedHasComment, getHasCommentHelper
} from "../comments/index.js";
const {
    getSingleVariableDeclarator as sharedGetSingleVariableDeclarator, getIdentifierText: sharedGetIdentifierText, isUndefinedSentinel: sharedIsUndefinedSentinel, getSingleMemberIndexPropertyEntry: sharedGetSingleMemberIndexPropertyEntry, unwrapParenthesizedExpression, getBodyStatements, toMutableArray, isObjectLike, forEachNodeChild, getNodeEndIndex, getNodeStartIndex, assignClonedLocation, resolveHelperOverride } = Core;


// Re-export selected core helpers into local scope for convenience. Some
// matcher logic expects these helpers to exist as local identifiers.
const getSingleMemberIndexPropertyEntry =
    sharedGetSingleMemberIndexPropertyEntry;

const DEFAULT_HELPERS = {
    getIdentifierText: sharedGetIdentifierText,
    isUndefinedLiteral: sharedIsUndefinedSentinel,
    getSingleVariableDeclarator: sharedGetSingleVariableDeclarator,
    hasComment: sharedHasComment
};

export function preprocessFunctionArgumentDefaults(
    ast,
    helpers = DEFAULT_HELPERS
) {
    if (!isObjectLike(ast)) {
        return ast;
    }

    const normalizedHelpers = {
        getIdentifierText: resolveHelperOverride(
            helpers,
            "getIdentifierText",
            DEFAULT_HELPERS.getIdentifierText
        ),
        isUndefinedLiteral: resolveHelperOverride(
            helpers,
            "isUndefinedLiteral",
            DEFAULT_HELPERS.isUndefinedLiteral
        ),
        getSingleVariableDeclarator: resolveHelperOverride(
            helpers,
            "getSingleVariableDeclarator",
            DEFAULT_HELPERS.getSingleVariableDeclarator
        ),
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

function traverse(node, visitor, seen = new Set()) {
    if (!isObjectLike(node)) {
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

    forEachNodeChild(node, (value, key) => {
        if (key === "parent") {
            return;
        }

        traverse(value, visitor, seen);
    });
}

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
    if (!body || body.type !== "BlockStatement") {
        return;
    }

    const params = toMutableArray(node.params);
    if (!Array.isArray(node.params)) {
        node.params = params;
    }

    const statements = getBodyStatements(body);
    const statementsToRemove = new Set();
    let appliedChanges = false;

    if (ensureTrailingOptionalParametersHaveUndefinedDefaults(params)) {
        appliedChanges = true;
    }

    if (statements.length === 0 && !appliedChanges) {
        return;
    }

    const condenseMatches = [];

    for (let index = 0; index < statements.length - 1; index += 1) {
        const varStatement = statements[index];
        const ifStatement = statements[index + 1];
        const condenseMatch = matchArgumentCountFallbackVarThenIf(
            varStatement,
            ifStatement,
            helpers
        );

        if (!condenseMatch) {
            continue;
        }

        condenseMatches.push(condenseMatch);
    }

    for (const condense of condenseMatches) {
        const {
            declarator,
            guardExpression,
            argumentExpression,
            fallbackExpression,
            ifStatement,
            sourceStatement
        } = condense;

        declarator.init = {
            type: "TernaryExpression",
            test: guardExpression,
            consequent: argumentExpression,
            alternate: fallbackExpression
        };

        sourceStatement._skipArgumentCountDefault = true;
        statementsToRemove.add(ifStatement);
        extendStatementEndLocation(sourceStatement, ifStatement);
        appliedChanges = true;
        body._gmlForceInitialBlankLine = true;
    }

    function extendStatementEndLocation(targetDeclaration, removedStatement) {
        if (!targetDeclaration || !removedStatement) {
            return;
        }

        const removalEnd = getNodeEndIndex(removedStatement);
        if (removalEnd == null) {
            return;
        }

        const declarationEnd = getNodeEndIndex(targetDeclaration);
        if (declarationEnd != null && declarationEnd >= removalEnd) {
            return;
        }

        assignClonedLocation(targetDeclaration, {
            end: removedStatement.end
        });

        const removedRangeEnd = Array.isArray(removedStatement.range)
            ? removedStatement.range[1]
            : null;

        if (typeof removedRangeEnd !== "number") {
            return;
        }

        if (Array.isArray(targetDeclaration.range)) {
            const [startRange] = targetDeclaration.range;
            targetDeclaration.range = [startRange, removedRangeEnd];
            return;
        }

        const declarationStart = getNodeStartIndex(targetDeclaration);
        if (typeof declarationStart !== "number") {
            return;
        }

        targetDeclaration.range = [declarationStart, removedRangeEnd];
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

    if (ensureTrailingOptionalParametersHaveUndefinedDefaults(params)) {
        appliedChanges = true;
    }

    if (matches.length === 0 && !appliedChanges) {
        return;
    }

    matches.sort((a, b) => {
        if (a.argumentIndex !== b.argumentIndex) {
            return a.argumentIndex - b.argumentIndex;
        }

        return a.statementIndex - b.statementIndex;
    });

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
            // If the match lacks a concrete target name, avoid creating a
            // placeholder parameter with an undefined name. This can occur
            // when upstream matchers return incomplete match objects during
            // heuristic detection; it's safer to skip in that case.
            if (!targetName || typeof targetName !== "string") {
                return null;
            }

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

        // Assign the default value on the parameter node.
        currentParam.default = match.fallbackExpression;
        appliedChanges = true;
    }

    // Remove matched fallback statements in reverse order to keep indices stable.
    const orderedRemovals = Array.from(statementsToRemove);
    orderedRemovals.sort((a, b) => getNodeStartIndex(b) - getNodeStartIndex(a));

    for (const removal of orderedRemovals) {
        const index = statements.indexOf(removal);
        if (index !== -1) {
            statements.splice(index, 1);
        }
    }

    // Helpers
    function ensureTrailingOptionalParametersHaveUndefinedDefaults(params) {
        if (!Array.isArray(params) || params.length === 0) {
            return false;
        }

        let changed = false;
        for (let i = params.length - 1; i >= 0; i -= 1) {
            const param = params[i];
            if (!param) {
                continue;
            }

            if (param.type === "Identifier") {
                if (param.default === undefined) {
                    param.default = { type: "Identifier", name: "undefined" };
                    changed = true;
                }
                continue;
            }

            // Already a defaulted parameter or other form; stop scanning backwards.
            break;
        }

        return changed;
    }

    function matchArgumentCountFallbackVarThenIf(
        varStatement,
        ifStatement,
        helpers
    ) {
        if (!varStatement || varStatement.type !== "VariableDeclaration") {
            return null;
        }

        if (!ifStatement || ifStatement.type !== "IfStatement") {
            return null;
        }

        const declarator = getSingleVariableDeclarator(varStatement);
        if (!declarator) {
            return null;
        }

        const { id, init } = declarator;
        if (!id || id.type !== "Identifier" || !init) {
            return null;
        }

        const match = matchArgumentCountFallbackStatement(ifStatement, helpers);
        if (!match) {
            return null;
        }

        // The matched statement may either assign *to* an argument index
        // (pattern A) or assign *from* an argument member access into a
        // local variable (pattern B). When the RHS is the argument access
        // the matcher returns `argumentExpression`; otherwise fall back to
        // using the declared identifier as the projected argument expression.
        const resultantArgumentExpression =
            match.argumentExpression === undefined
                ? id
                : match.argumentExpression;

        const resultantFallbackExpression =
            match.fallbackExpression === undefined
                ? init
                : match.fallbackExpression;

        return {
            declarator,
            guardExpression: match.guardExpression,
            argumentExpression: resultantArgumentExpression,
            fallbackExpression: resultantFallbackExpression,
            ifStatement,
            sourceStatement: varStatement
        };
    }

    function matchArgumentCountFallbackStatement(statement, helpers) {
        if (!statement) {
            return null;
        }

        // Match `if (argument_count < 2) argument2 = ...;` style guards and
        // `if (argument_count == 0) { argument0 = ... }` forms.
        if (statement.type === "IfStatement") {
            const condition = unwrapParenthesizedExpression(statement.test);
            const result = matchArgumentCountGuard(condition);
            if (!result) {
                return null;
            }

            const argumentIndex = result.argumentIndex;
            const thenBlock = statement.consequent;
            if (!thenBlock) {
                return null;
            }

            // Accept either a single expression statement or a block with a
            // single expression/assignment statement.
            const statements =
                thenBlock.type === "BlockStatement"
                    ? getBodyStatements(thenBlock)
                    : [thenBlock];

            for (const stmt of statements) {
                const match = matchAssignmentToArgumentIndex(
                    stmt,
                    argumentIndex,
                    helpers
                );
                if (match) {
                    return {
                        argumentIndex,
                        fallbackExpression: match.fallbackExpression,
                        argumentExpression: match.argumentExpression,
                        statementNode: statement,
                        guardExpression: condition
                    };
                }
            }
        }

        return null;
    }

    function matchAssignmentToArgumentIndex(node, argumentIndex, helpers) {
        if (!node) {
            return null;
        }

        // Accept either an ExpressionStatement wrapping an AssignmentExpression
        // or the AssignmentExpression node itself. This covers parser shapes
        // where single-line `if (cond) a = b;` may produce the assignment
        // directly as the consequent.
        let assignment = null;
        if (
            node.type === "ExpressionStatement" &&
            node.expression &&
            node.expression.type === "AssignmentExpression"
        ) {
            assignment = node.expression;
        } else if (node.type === "AssignmentExpression") {
            assignment = node;
        } else {
            return null;
        }

        const left = assignment.left;
        const right = assignment.right;
        if (!right) {
            return null;
        }

        // Pattern A: assignment writes into an `argumentN` target (e.g. `argument0 = foo;`)
        if (left.type === "Identifier") {
            const name = getIdentifierText(left);
            if (name && name.toLowerCase().startsWith("argument")) {
                const suffix = name.slice(8);
                const idx = Number(suffix);
                if (!Number.isNaN(idx) && idx === argumentIndex) {
                    return { fallbackExpression: right };
                }
            }
        }

        if (left.type === "MemberIndexExpression") {
            const single = getSingleMemberIndexPropertyEntry(left);
            if (!single) {
                return null;
            }

            const indexText = helpers.getIdentifierText(single);
            const indexNumber = Number(indexText);
            if (!Number.isNaN(indexNumber) && indexNumber === argumentIndex) {
                return { fallbackExpression: right };
            }
        }

        // Pattern B: assignment reads from an `argument[index]` on the RHS
        // and assigns into a local variable (e.g. `setting = argument[1];`).
        if (right && right.type === "MemberIndexExpression") {
            const single = getSingleMemberIndexPropertyEntry(right);
            if (single) {
                const indexText = helpers.getIdentifierText(single);
                const indexNumber = Number(indexText);
                if (
                    !Number.isNaN(indexNumber) &&
                    indexNumber === argumentIndex
                ) {
                    return { argumentExpression: right };
                }
            }
        }

        return null;
    }

    function matchArgumentCountGuard(node) {
        if (!node || node.type !== "BinaryExpression") {
            return null;
        }

        const { left, right, operator } = node;
        if (!left || !right) {
            return null;
        }

        const leftText = resolveNodeToArgumentCountSubject(left);
        if (!leftText) {
            return null;
        }

        const rightNumber = Number(helpers.getIdentifierText(right));
        if (Number.isNaN(rightNumber)) {
            return null;
        }

        if (operator === "<") {
            return { argumentIndex: rightNumber - 1 };
        }

        if (operator === ">") {
            return { argumentIndex: rightNumber };
        }

        if (operator === "==" || operator === "===") {
            return { argumentIndex: rightNumber };
        }

        return null;
    }

    function resolveNodeToArgumentCountSubject(node) {
        const text = getIdentifierText(node);
        if (
            typeof text === "string" &&
            text.toLowerCase() === "argument_count"
        ) {
            return text;
        }

        return null;
    }

    function getIdentifierFromParameter(param, helpers) {
        if (!param) {
            return null;
        }

        if (param.type === "Identifier") {
            return param;
        }

        // Optional parameter with default: `param = <expr>`
        if (param.type === "AssignmentPattern") {
            return param.left;
        }

        return null;
    }
}
