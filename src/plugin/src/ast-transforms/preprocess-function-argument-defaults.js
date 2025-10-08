import { hasComment } from "../printer/util.js";

/**
 * Normalize function parameters by converting argument_count fallbacks into default parameters.
 *
 * @param {import("prettier").AstPath} path
 * @param {{ getIdentifierText: (node: unknown) => string | null, isUndefinedLiteral: (node: unknown) => boolean }} helpers
 */
export function preprocessFunctionArgumentDefaults(path, helpers = {}) {
    const node = path?.getValue?.();
    if (!node || node.type !== "FunctionDeclaration") {
        return;
    }

    if (node._hasProcessedArgumentCountDefaults) {
        return;
    }

    const getIdentifierText = typeof helpers.getIdentifierText === "function"
        ? helpers.getIdentifierText
        : null;
    const isUndefinedLiteral = typeof helpers.isUndefinedLiteral === "function"
        ? helpers.isUndefinedLiteral
        : null;

    if (!getIdentifierText || !isUndefinedLiteral) {
        return;
    }

    node._hasProcessedArgumentCountDefaults = true;

    const body = node.body;
    if (!body || body.type !== "BlockStatement" || !Array.isArray(body.body) || body.body.length === 0) {
        return;
    }

    const statements = body.body;
    const matches = [];

    for (let statementIndex = 0; statementIndex < statements.length; statementIndex++) {
        const statement = statements[statementIndex];
        const match = matchArgumentCountFallbackStatement(statement, {
            getIdentifierText,
            isUndefinedLiteral
        });

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
    params.forEach((param, index) => {
        const identifier = getIdentifierFromParameter(param, { getIdentifierText });
        if (!identifier) {
            return;
        }

        const name = getIdentifierText(identifier);
        if (!name) {
            return;
        }

        paramInfoByName.set(name, { index, identifier });
    });

    const statementsToRemove = new Set();
    let appliedChanges = false;

    const ensureParameterInfoForMatch = (match) => {
        if (!match) {
            return null;
        }

        const { targetName, argumentIndex } = match;

        if (argumentIndex == null || argumentIndex < 0) {
            return null;
        }

        const existingInfo = paramInfoByName.get(targetName);
        if (existingInfo) {
            if (existingInfo.index === argumentIndex) {
                return existingInfo;
            }
            return null;
        }

        if (argumentIndex > params.length) {
            return null;
        }

        if (argumentIndex === params.length) {
            const newIdentifier = {
                type: "Identifier",
                name: targetName
            };
            params.push(newIdentifier);
            const info = { index: argumentIndex, identifier: newIdentifier };
            paramInfoByName.set(targetName, info);
            return info;
        }

        const paramAtIndex = params[argumentIndex];
        const identifier = getIdentifierFromParameter(paramAtIndex, { getIdentifierText });
        if (!identifier) {
            return null;
        }

        const identifierName = getIdentifierText(identifier);
        if (!identifierName || identifierName !== targetName) {
            return null;
        }

        const info = { index: argumentIndex, identifier };
        paramInfoByName.set(targetName, info);
        return info;
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
                {
                    getIdentifierText,
                    isUndefinedLiteral
                }
            );

            if (redundantVar) {
                statementsToRemove.add(redundantVar);
            }
        }
    }

    if (!appliedChanges || statementsToRemove.size === 0) {
        return;
    }

    body.body = body.body.filter((statement) => !statementsToRemove.has(statement));
}

function getIdentifierFromParameter(param, { getIdentifierText }) {
    if (!param) {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (param.type === "DefaultParameter" && param.left?.type === "Identifier") {
        return param.left;
    }

    if (param.type === "ConstructorParentClause" && Array.isArray(param.params)) {
        for (const childParam of param.params) {
            const identifier = getIdentifierFromParameter(childParam, { getIdentifierText });
            if (identifier) {
                return identifier;
            }
        }
    }

    return null;
}

function matchArgumentCountFallbackStatement(statement, helpers) {
    if (!statement) {
        return null;
    }

    if (statement.comments && statement.comments.length > 0) {
        return null;
    }

    if (statement.type === "VariableDeclaration") {
        return matchArgumentCountFallbackFromVariableDeclaration(statement, helpers);
    }

    if (statement.type === "IfStatement") {
        return matchArgumentCountFallbackFromIfStatement(statement, helpers);
    }

    return null;
}

function matchArgumentCountFallbackFromVariableDeclaration(node, helpers) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    if (node.kind !== "var") {
        return null;
    }

    if (!Array.isArray(node.declarations) || node.declarations.length !== 1) {
        return null;
    }

    const declarator = node.declarations[0];
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return null;
    }

    if (declarator.comments && declarator.comments.length > 0) {
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

function matchArgumentCountFallbackFromIfStatement(node, helpers) {
    if (!node || node.type !== "IfStatement") {
        return null;
    }

    const guard = parseArgumentCountGuard(node.test);
    if (!guard) {
        return null;
    }

    const consequentAssignment = extractAssignmentFromStatement(node.consequent);
    const alternateAssignment = extractAssignmentFromStatement(node.alternate);

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

    const argumentAssignment = consequentIsArgument ? consequentAssignment : alternateAssignment;
    const fallbackAssignment = consequentIsArgument ? alternateAssignment : consequentAssignment;

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

function findRedundantVarDeclarationBefore(statements, currentIndex, targetName, helpers) {
    if (!Array.isArray(statements) || currentIndex <= 0) {
        return null;
    }

    const candidate = statements[currentIndex - 1];

    if (!isStandaloneVarDeclarationForTarget(candidate, targetName, helpers)) {
        return null;
    }

    return candidate;
}

function isStandaloneVarDeclarationForTarget(node, targetName, helpers) {
    if (!node || node.type !== "VariableDeclaration") {
        return false;
    }

    if (node.kind !== "var") {
        return false;
    }

    if (hasComment(node)) {
        return false;
    }

    if (!Array.isArray(node.declarations) || node.declarations.length !== 1) {
        return false;
    }

    const declarator = node.declarations[0];

    if (!declarator || declarator.type !== "VariableDeclarator") {
        return false;
    }

    if (hasComment(declarator)) {
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

function extractAssignmentFromStatement(statement) {
    if (!statement) {
        return null;
    }

    if (statement.comments && statement.comments.length > 0) {
        return null;
    }

    if (statement.type === "BlockStatement") {
        if (!Array.isArray(statement.body) || statement.body.length !== 1) {
            return null;
        }
        return extractAssignmentFromStatement(statement.body[0]);
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

function parseArgumentCountGuard(node) {
    if (!node || node.type !== "BinaryExpression") {
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

    if (node.operator === ">") {
        return rightIndex >= 0 ? { argumentIndex: rightIndex } : null;
    }

    if (node.operator === ">=") {
        const adjusted = rightIndex - 1;
        return adjusted >= 0 ? { argumentIndex: adjusted } : null;
    }

    return null;
}

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

function isArgumentArrayAccess(node, expectedIndex) {
    if (!node || node.type !== "MemberIndexExpression") {
        return false;
    }

    if (!node.object || node.object.type !== "Identifier" || node.object.name !== "argument") {
        return false;
    }

    if (!Array.isArray(node.property) || node.property.length !== 1) {
        return false;
    }

    const indexNode = node.property[0];
    const actualIndex = parseArgumentIndexValue(indexNode);
    if (actualIndex === null) {
        return false;
    }

    return actualIndex === expectedIndex;
}
