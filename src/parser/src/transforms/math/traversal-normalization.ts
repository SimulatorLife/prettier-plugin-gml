import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { applyScalarCondensing } from "./scalar-condensing.js";

const {
    ASSIGNMENT_EXPRESSION,
    BINARY_EXPRESSION,
    CALL_EXPRESSION,
    EXPRESSION_STATEMENT,
    IDENTIFIER,
    LITERAL,
    MEMBER_DOT_EXPRESSION,
    MEMBER_INDEX_EXPRESSION,
    PARENTHESIZED_EXPRESSION,
    UNARY_EXPRESSION,
    VARIABLE_DECLARATION
} = Core;

export type ConvertManualMathTransformOptions = {
    sourceText?: string;
    originalText?: string;
};

export function applyManualMathNormalization(
    ast: any,
    context: ConvertManualMathTransformOptions | null = null
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const traversalContext = normalizeTraversalContext(ast, context);

    traverse(ast, new Set(), traversalContext);
    combineLengthdirScalarAssignments(ast);

    return ast;
}

function traverse(node, seen, context) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (node._gmlManualMathOriginal === true) {
        return;
    }

    if (seen.has(node)) {
        return;
    }

    seen.add(node);

    if (Array.isArray(node)) {
        for (const element of node) {
            traverse(element, seen, context);
        }
        return;
    }

    let changed = true;
    while (changed) {
        changed = false;

        if (node.type === BINARY_EXPRESSION) {
            if (attemptSimplifyOneMinusFactor(node, context)) {
                changed = true;
                continue;
            }

            if (attemptRemoveMultiplicativeIdentity(node, context)) {
                changed = true;
                continue;
            }

            if (attemptReplaceMultiplicationWithZero(node, context)) {
                changed = true;
                continue;
            }

            if (attemptRemoveAdditiveIdentity(node, context)) {
                changed = true;
                continue;
            }

            if (attemptConvertDegreesToRadians(node, context)) {
                changed = true;
                continue;
            }

            if (attemptSimplifyDivisionByReciprocal(node, context)) {
                changed = true;
                continue;
            }

            if (attemptCancelReciprocalRatios(node, context)) {
                changed = true;
                continue;
            }

            if (attemptSimplifyNegativeDivisionProduct(node, context)) {
                changed = true;
                continue;
            }

            if (attemptCondenseScalarProduct(node, context)) {
                changed = true;
                continue;
            }

            if (attemptCondenseNumericChainWithMultipleBases(node, context)) {
                changed = true;
                continue;
            }

            if (attemptCollectDistributedScalars(node, context)) {
                changed = true;
                continue;
            }

            if (attemptSimplifyLengthdirHalfDifference(node, context)) {
                changed = true;
                continue;
            }

            if (attemptConvertRepeatedPower(node)) {
                changed = true;
                continue;
            }

            if (attemptConvertSquare(node, context)) {
                changed = true;
                continue;
            }

            if (attemptConvertMean(node)) {
                changed = true;
                continue;
            }

            if (attemptConvertLog2(node)) {
                changed = true;
                continue;
            }

            if (attemptConvertLengthDir(node)) {
                changed = true;
                continue;
            }

            if (attemptConvertDotProducts(node)) {
                changed = true;
                continue;
            }
        }

        if (node.type === CALL_EXPRESSION) {
            if (attemptConvertPointDistanceCall(node)) {
                changed = true;
                continue;
            }

            if (attemptConvertPowerToSqrt(node)) {
                changed = true;
                continue;
            }

            if (attemptConvertPowerToExp(node)) {
                changed = true;
                continue;
            }

            if (attemptConvertPointDirection(node)) {
                changed = true;
                continue;
            }

            if (attemptConvertTrigDegreeArguments(node)) {
                changed = true;
                continue;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "parent" || !value || typeof value !== "object") {
                continue;
            }

            traverse(value, seen, context);
        }
    }
}

function attemptSimplifyOneMinusFactor(node, context) {
    if (!isBinaryOperator(node, "*")) {
        return false;
    }

    let modified = false;

    if (simplifyOneMinusOperand(node, "left", context)) {
        modified = true;
    }

    if (simplifyOneMinusOperand(node, "right", context)) {
        modified = true;
    }

    return modified;
}

function simplifyOneMinusOperand(node, key, context) {
    const rawOperand = node[key];
    if (!rawOperand || Core.hasComment(rawOperand)) {
        return false;
    }

    const expression = unwrapExpression(rawOperand);
    if (!expression || Core.hasComment(expression)) {
        return false;
    }

    if (context && hasInlineCommentBetween(node.left, node.right, context)) {
        return false;
    }

    if (
        context &&
        expression.type === BINARY_EXPRESSION &&
        hasInlineCommentBetween(expression.left, expression.right, context)
    ) {
        return false;
    }

    const numericValue = evaluateOneMinusNumeric(expression);
    if (numericValue === null || !Number.isFinite(numericValue)) {
        return false;
    }

    const normalizedValue = normalizeNumericCoefficient(numericValue);
    if (normalizedValue === null) {
        return false;
    }

    if (
        expression.type === LITERAL &&
        String(expression.value) === normalizedValue
    ) {
        return false;
    }

    const literal = createNumericLiteral(normalizedValue, rawOperand);
    if (!literal) {
        return false;
    }

    node[key] = literal;
    return true;
}

function attemptRemoveMultiplicativeIdentity(node, context) {
    if (!isBinaryOperator(node, "*")) {
        return false;
    }

    if (context && hasInlineCommentBetween(node.left, node.right, context)) {
        return false;
    }

    return removeMultiplicativeIdentityOperand(node, "right", "left", context);
}

function attemptReplaceMultiplicationWithZero(node, context) {
    if (!isBinaryOperator(node, "*")) {
        return false;
    }

    if (context && hasInlineCommentBetween(node.left, node.right, context)) {
        return false;
    }

    if (replaceMultiplicationWithZeroOperand(node, "left", "right", context)) {
        return true;
    }

    if (replaceMultiplicationWithZeroOperand(node, "right", "left", context)) {
        return true;
    }

    return false;
}

function removeMultiplicativeIdentityOperand(node, key, otherKey, context) {
    const operand = node[key];
    const other = node[otherKey];

    if (!operand || !other) {
        return false;
    }

    if (Core.hasComment(operand) || Core.hasComment(other)) {
        return false;
    }

    const expression = unwrapExpression(operand);
    if (!expression) {
        return false;
    }

    const value = parseNumericLiteral(expression);
    if (value === null) {
        return false;
    }

    if (Math.abs(value - 1) > computeNumericTolerance(1)) {
        return false;
    }

    const sanitizedOperand = isSafeOperand(other)
        ? unwrapExpression(other)
        : other;

    const replacement = Core.cloneAstNode(sanitizedOperand);
    if (!replaceNodeWith(node, replacement)) {
        return false;
    }

    node.__fromMultiplicativeIdentity = true;
    unwrapIdentityReplacementResult(node);
    unwrapEnclosingParentheses(node, context);

    return true;
}

function unwrapIdentityReplacementResult(node) {
    while (
        node &&
        node.type === PARENTHESIZED_EXPRESSION &&
        node.expression &&
        isIdentityReplacementSafeExpression(node.expression)
    ) {
        if (!replaceNodeWith(node, node.expression)) {
            break;
        }

        node.__fromMultiplicativeIdentity = true;
    }
}

function combineLengthdirScalarAssignments(ast) {
    if (!ast || typeof ast !== "object") {
        return;
    }

    const body = Array.isArray(ast.body) ? ast.body : null;
    if (!body) {
        for (const value of Object.values(ast)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            combineLengthdirScalarAssignments(value);
        }
        return;
    }

    for (let index = 0; index < body.length - 1; index += 1) {
        const declaration = body[index];
        const next = body[index + 1];

        if (
            !declaration ||
            declaration.type !== VARIABLE_DECLARATION ||
            !Array.isArray(declaration.declarations) ||
            declaration.declarations.length !== 1 ||
            Core.hasComment(declaration)
        ) {
            continue;
        }

        const [declarator] = declaration.declarations;
        if (
            !declarator ||
            Core.hasComment(declarator) ||
            !declarator.init ||
            Core.hasComment(declarator.init)
        ) {
            continue;
        }

        if (!next) {
            continue;
        }

        const assignment =
            next.type === EXPRESSION_STATEMENT ? next.expression : next;
        if (
            !assignment ||
            assignment.type !== ASSIGNMENT_EXPRESSION ||
            assignment.operator !== "=" ||
            Core.hasComment(next) ||
            Core.hasComment(assignment)
        ) {
            continue;
        }

        const baseName = getIdentifierName(declarator.id);
        if (!baseName || getIdentifierName(assignment.left) !== baseName) {
            continue;
        }

        const match = matchLengthdirReassignment(assignment.right, baseName);

        if (!match) {
            continue;
        }

        const initClone = Core.cloneAstNode(declarator.init);
        if (!initClone) {
            continue;
        }

        let baseTimesFactor = initClone;

        if (!scaleNumericLiteralCoefficient(baseTimesFactor, match.factor)) {
            const normalizedFactor = normalizeNumericCoefficient(match.factor);
            if (normalizedFactor === null) {
                continue;
            }

            const factorLiteral = createNumericLiteral(
                normalizedFactor,
                match.factorNode
            );
            if (!factorLiteral) {
                continue;
            }

            baseTimesFactor = createBinaryExpressionNode(
                "*",
                baseTimesFactor,
                factorLiteral,
                assignment.right
            );
        }

        const callOneLiteral = createNumericLiteral("1", assignment.right);
        const differenceOneLiteral = createNumericLiteral(
            "1",
            assignment.right
        );
        if (!callOneLiteral || !differenceOneLiteral) {
            continue;
        }

        const lengthdirCall = createCallExpressionNode(
            match.functionName,
            [callOneLiteral, Core.cloneAstNode(match.angle)],
            match.callExpression
        );
        if (!lengthdirCall) {
            continue;
        }

        const difference = createBinaryExpressionNode(
            "-",
            differenceOneLiteral,
            lengthdirCall,
            assignment.right
        );

        const parenthesizedDifference = createParenthesizedExpressionNode(
            difference,
            assignment.right
        );
        if (!parenthesizedDifference) {
            continue;
        }

        const finalExpression = createBinaryExpressionNode(
            "*",
            baseTimesFactor,
            parenthesizedDifference,
            assignment.right
        );

        applyScalarCondensing(finalExpression);

        declarator.init = finalExpression;
        body.splice(index + 1, 1);
        index -= 1;
    }

    for (const element of body) {
        if (!element || typeof element !== "object") {
            continue;
        }

        combineLengthdirScalarAssignments(element);
    }
}

function matchLengthdirReassignment(expression, identifierName) {
    const root = unwrapExpression(expression);
    if (!root || root.type !== BINARY_EXPRESSION || root.operator !== "-") {
        return null;
    }

    const callExpression = unwrapExpression(root.right);
    if (!callExpression || callExpression.type !== CALL_EXPRESSION) {
        return null;
    }

    if (Core.hasComment(callExpression)) {
        return null;
    }

    const functionName = getIdentifierName(callExpression.object);
    if (functionName !== "lengthdir_x") {
        return null;
    }

    const args = Array.isArray(callExpression.arguments)
        ? callExpression.arguments
        : [];

    if (args.length !== 2) {
        return null;
    }

    const magnitudeInfo = matchIdentifierTimesFactor(args[0], identifierName);
    if (!magnitudeInfo) {
        return null;
    }

    const left = unwrapExpression(root.left);
    const difference = unwrapExpression(left);
    if (
        !difference ||
        difference.type !== BINARY_EXPRESSION ||
        difference.operator !== "-"
    ) {
        return null;
    }

    if (!isIdentifierNamed(difference.left, identifierName)) {
        return null;
    }

    const subtractInfo = matchIdentifierTimesFactor(
        difference.right,
        identifierName
    );

    if (!subtractInfo) {
        return null;
    }

    const tolerance = computeNumericTolerance(0);
    if (Math.abs(magnitudeInfo.factor - subtractInfo.factor) > tolerance) {
        return null;
    }

    return {
        factor: magnitudeInfo.factor,
        factorNode: subtractInfo.literalNode ?? magnitudeInfo.literalNode,
        angle: args[1],
        functionName,
        callExpression
    };
}

function matchIdentifierTimesFactor(expression, identifierName) {
    const unwrapped = unwrapExpression(expression);
    if (!unwrapped || Core.hasComment(unwrapped)) {
        return null;
    }

    if (unwrapped.type !== BINARY_EXPRESSION) {
        return null;
    }

    const operator =
        typeof unwrapped.operator === "string"
            ? unwrapped.operator.toLowerCase()
            : null;

    let factorNode;
    let factorValue;

    if (operator === "*") {
        if (isIdentifierNamed(unwrapped.left, identifierName)) {
            factorNode = unwrapped.right;
        } else if (isIdentifierNamed(unwrapped.right, identifierName)) {
            factorNode = unwrapped.left;
        } else {
            return null;
        }

        factorValue = parseNumericFactor(factorNode);
    } else if (operator === "/") {
        if (!isIdentifierNamed(unwrapped.left, identifierName)) {
            return null;
        }

        const divisorValue = parseNumericFactor(unwrapped.right);
        if (divisorValue === null) {
            return null;
        }

        if (Math.abs(divisorValue) <= computeNumericTolerance(0)) {
            return null;
        }

        factorNode = unwrapped.right;
        factorValue = 1 / divisorValue;
    } else {
        return null;
    }

    if (factorValue === null) {
        return null;
    }

    const literalNode = unwrapExpression(factorNode) ?? factorNode;

    return {
        factor: factorValue,
        literalNode
    };
}

function createBinaryExpressionNode(operator, left, right, template) {
    const expression = {
        type: BINARY_EXPRESSION,
        operator,
        left,
        right
    };

    Core.assignClonedLocation(expression, template);

    return expression;
}

function createParenthesizedExpressionNode(expression, template) {
    if (!expression || typeof expression !== "object") {
        return null;
    }

    const node = {
        type: PARENTHESIZED_EXPRESSION,
        expression
    };

    Core.assignClonedLocation(node, template);

    return node;
}

function scaleNumericLiteralCoefficient(node, factor) {
    if (!Number.isFinite(factor)) {
        return false;
    }

    const literal = findFirstNumericLiteral(node);
    if (!literal) {
        return false;
    }

    const literalValue = parseNumericLiteral(literal);
    if (literalValue === null) {
        return false;
    }

    const scaledValue = literalValue * factor;
    const normalizedValue = normalizeNumericCoefficient(scaledValue);
    if (normalizedValue === null) {
        return false;
    }

    literal.value = normalizedValue;
    return true;
}

function findFirstNumericLiteral(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === LITERAL) {
        return parseNumericLiteral(node) === null ? null : node;
    }

    for (const value of Object.values(node)) {
        if (!value || typeof value !== "object") {
            continue;
        }

        if (Array.isArray(value)) {
            for (const element of value) {
                const result = findFirstNumericLiteral(element);
                if (result) {
                    return result;
                }
            }
        } else {
            const result = findFirstNumericLiteral(value);
            if (result) {
                return result;
            }
        }
    }

    return null;
}

function isIdentifierNamed(node, name) {
    // TODO: Move this helper to where the other identifier functionality lives
    const identifierName = getIdentifierName(node);
    return typeof identifierName === "string" && identifierName === name;
}

function isIdentityReplacementSafeExpression(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (Core.hasComment(node)) {
        return false;
    }

    switch (node.type) {
        case IDENTIFIER:
        case LITERAL:
        case CALL_EXPRESSION:
        case MEMBER_DOT_EXPRESSION:
        case MEMBER_INDEX_EXPRESSION: {
            return true;
        }
        case PARENTHESIZED_EXPRESSION: {
            return isIdentityReplacementSafeExpression(node.expression);
        }
        default: {
            return false;
        }
    }
}

function attemptCondenseSimpleScalarProduct(node, context) {
    if (!isBinaryOperator(node, "*")) {
        return false;
    }

    const chain = { numerators: [], denominators: [] };
    if (!collectMultiplicativeChain(node, chain, false, null)) {
        return false;
    }

    const nonNumericTerms = [];
    let coefficient = 1;
    let hasNumericContribution = false;

    for (const term of chain.numerators) {
        if (Core.hasComment(term.expression)) {
            return false;
        }

        const numericValue = parseNumericFactor(term.expression);
        if (numericValue === null) {
            nonNumericTerms.push(term);
            continue;
        }

        coefficient *= numericValue;
        hasNumericContribution = true;
    }

    const cancelledReciprocalTerms =
        cancelSimpleReciprocalNumeratorPairs(nonNumericTerms);

    if (cancelledReciprocalTerms) {
        hasNumericContribution = true;
    }

    if (
        chain.denominators.length === 0 &&
        !cancelledReciprocalTerms &&
        Math.abs(coefficient - 1) > computeNumericTolerance(1)
    ) {
        return false;
    }

    if (nonNumericTerms.length === 0) {
        return false;
    }

    for (const term of chain.denominators) {
        if (Core.hasComment(term.expression)) {
            return false;
        }

        const numericValue = parseNumericFactor(term.expression);
        if (
            numericValue === null ||
            Math.abs(numericValue) <= computeNumericTolerance(0)
        ) {
            if (numericValue === null) {
                const matchIndex = nonNumericTerms.findIndex((candidate) =>
                    areSimpleExpressionsEquivalent(
                        candidate.expression,
                        term.expression
                    )
                );

                if (matchIndex !== -1) {
                    nonNumericTerms.splice(matchIndex, 1);
                    continue;
                }
            }

            return false;
        }

        coefficient /= numericValue;
        hasNumericContribution = true;
    }

    if (!hasNumericContribution || !Number.isFinite(coefficient)) {
        return false;
    }

    const normalizedCoefficient = normalizeNumericCoefficient(coefficient);
    if (normalizedCoefficient === null) {
        return false;
    }

    const operand = cloneMultiplicativeTerms(nonNumericTerms, node);
    if (!operand) {
        return false;
    }

    const unitTolerance = computeNumericTolerance(1);
    const normalizedNumber =
        typeof normalizedCoefficient === "number"
            ? normalizedCoefficient
            : Number(normalizedCoefficient);
    if (!Number.isFinite(normalizedNumber)) return false;
    if (Math.abs(normalizedNumber - 1) <= unitTolerance) {
        const originalExpression = Core.cloneAstNode(node);

        if (!replaceNodeWith(node, operand)) {
            return false;
        }

        node.__fromMultiplicativeIdentity = true;
        recordManualMathOriginalAssignment(context, node, originalExpression);

        return true;
    }
    const literal = createNumericLiteral(normalizedCoefficient, node) as any;
    if (!literal) {
        return false;
    }

    node.operator = "*";
    node.left = operand;
    node.right = literal;
    node.__fromMultiplicativeIdentity = true;

    return true;
}

function cancelSimpleReciprocalNumeratorPairs(terms) {
    if (!Array.isArray(terms) || terms.length < 2) {
        return false;
    }

    const consumed = new Set();
    const tolerance = computeNumericTolerance(1);
    let cancelled = false;

    for (let index = 0; index < terms.length; index += 1) {
        if (consumed.has(index)) {
            continue;
        }

        const term = terms[index];
        const expression = unwrapExpression(term.expression);
        if (!expression || expression.type !== BINARY_EXPRESSION) {
            continue;
        }

        const operator =
            typeof expression.operator === "string"
                ? expression.operator.toLowerCase()
                : null;

        if (operator !== "/") {
            continue;
        }

        const numeratorValue = parseNumericFactor(expression.left);
        if (
            numeratorValue === null ||
            Math.abs(numeratorValue - 1) > tolerance
        ) {
            continue;
        }

        const matchIndex = terms.findIndex((candidate, candidateIndex) => {
            if (
                candidateIndex === index ||
                consumed.has(candidateIndex) ||
                Core.hasComment(candidate.expression)
            ) {
                return false;
            }

            return areSimpleExpressionsEquivalent(
                candidate.expression,
                expression.right
            );
        });

        if (matchIndex === -1) {
            continue;
        }

        consumed.add(index);
        consumed.add(matchIndex);
        cancelled = true;
    }

    if (!cancelled) {
        return false;
    }

    const remaining = [];
    for (const [index, term] of terms.entries()) {
        if (consumed.has(index)) {
            continue;
        }

        remaining.push(term);
    }

    terms.length = 0;
    for (const term of remaining) {
        terms.push(term);
    }

    return true;
}

function areSimpleExpressionsEquivalent(left, right) {
    return areNodesApproximatelyEquivalent(left, right);
}

function unwrapEnclosingParentheses(node, context) {
    if (!node || typeof node !== "object") {
        return;
    }

    const root = context?.astRoot;
    if (!root || typeof root !== "object") {
        return;
    }

    let current = node;
    while (true) {
        const parentInfo = findParentEntry(root, current);
        if (!parentInfo) {
            break;
        }

        const { parent } = parentInfo;
        if (!parent || typeof parent !== "object") {
            break;
        }

        if (parent.type !== PARENTHESIZED_EXPRESSION) {
            break;
        }

        const expression = parent.expression;
        if (!expression) {
            break;
        }

        if (Core.hasComment(parent) || Core.hasComment(expression)) {
            break;
        }

        if (!isSafeOperand(parent)) {
            break;
        }

        replaceNodeWith(parent, current);
        current = parent;
    }
}

function findParentEntry(root, target) {
    const stack = [{ parent: null, key: null, node: root }];
    const visited = new Set();

    while (stack.length > 0) {
        const { parent, key, node } = stack.pop();
        if (node === target) {
            return { parent, key };
        }

        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }

        visited.add(node);

        if (Array.isArray(node)) {
            for (let index = node.length - 1; index >= 0; index -= 1) {
                const element = node[index];
                stack.push({ parent: node, key: index, node: element });
            }
            continue;
        }

        for (const [childKey, childValue] of Object.entries(node)) {
            if (childKey === "parent") {
                continue;
            }

            stack.push({ parent: node, key: childKey, node: childValue });
        }
    }

    return null;
}

function replaceMultiplicationWithZeroOperand(node, key, otherKey, context) {
    const operand = node[key];
    const other = node[otherKey];

    if (!operand || !other) {
        return false;
    }

    if (Core.hasComment(operand) || Core.hasComment(other)) {
        return false;
    }

    const expression = unwrapExpression(operand);
    if (!expression) {
        return false;
    }

    const value = parseNumericLiteral(expression);
    if (value === null) {
        return false;
    }

    if (Math.abs(value) > computeNumericTolerance(0)) {
        return false;
    }

    const parentLine = node?.end?.line;
    const zeroLiteral = createNumericLiteral(0, expression);

    if (!zeroLiteral) {
        return false;
    }

    replaceNode(node, zeroLiteral);
    suppressTrailingLineComment(node, parentLine, context, "original");
    removeSimplifiedAliasDeclaration(context, node);

    return true;
}

function isMultiplicationAnnihilatedByZero(node, context) {
    if (!isBinaryOperator(node, "*")) {
        return false;
    }

    const { left, right } = node;

    if (!left || !right) {
        return false;
    }

    if (Core.hasComment(node) || Core.hasComment(left)) {
        return false;
    }

    if (Core.hasComment(right)) {
        return false;
    }

    if (context && hasInlineCommentBetween(left, right, context)) {
        return false;
    }

    return (
        isNumericZeroLiteral(unwrapExpression(left)) ||
        isNumericZeroLiteral(unwrapExpression(right))
    );
}

function isNumericZeroLiteral(node) {
    const literalValue = parseNumericLiteral(node);
    if (literalValue === null) {
        return false;
    }

    return Math.abs(literalValue) <= computeNumericTolerance(0);
}

function attemptRemoveAdditiveIdentity(node, context) {
    if (!isBinaryOperator(node, "+")) {
        return false;
    }

    if (context && hasInlineCommentBetween(node.left, node.right, context)) {
        return false;
    }

    if (removeAdditiveIdentityOperand(node, "left", "right", context)) {
        return true;
    }

    if (removeAdditiveIdentityOperand(node, "right", "left", context)) {
        return true;
    }

    return false;
}

function removeAdditiveIdentityOperand(node, key, otherKey, context) {
    const operand = node[key];
    const other = node[otherKey];

    if (!operand || !other) {
        return false;
    }

    if (Core.hasComment(other)) {
        return false;
    }

    const expression = unwrapExpression(operand);
    if (!expression) {
        return false;
    }

    let value = parseNumericLiteral(expression);

    if (
        value === null &&
        isMultiplicationAnnihilatedByZero(expression, context)
    ) {
        value = 0;
    }

    if (value === null) {
        return false;
    }

    if (Math.abs(value) > computeNumericTolerance(0)) {
        return false;
    }

    const parentLine = node?.end?.line;

    if (!replaceNodeWith(node, other)) {
        return false;
    }

    suppressTrailingLineComment(node, parentLine, context, "original");
    removeSimplifiedAliasDeclaration(context, node);

    return true;
}

function attemptSimplifyDivisionByReciprocal(node, context) {
    if (!isBinaryOperator(node, "/")) {
        return false;
    }

    if (
        Core.hasComment(node) ||
        Core.hasComment(node.left) ||
        Core.hasComment(node.right)
    ) {
        return false;
    }

    if (context && hasInlineCommentBetween(node.left, node.right, context)) {
        return false;
    }

    const denominator = unwrapExpression(node.right);
    if (
        !denominator ||
        denominator.type !== BINARY_EXPRESSION ||
        denominator.operator !== "/"
    ) {
        return false;
    }

    if (
        Core.hasComment(denominator) ||
        Core.hasComment(denominator.left) ||
        Core.hasComment(denominator.right)
    ) {
        return false;
    }

    if (
        context &&
        hasInlineCommentBetween(denominator.left, denominator.right, context)
    ) {
        return false;
    }

    const numerator = unwrapExpression(denominator.left);
    const rawReciprocalFactor = denominator.right;
    const reciprocalFactor = unwrapExpression(rawReciprocalFactor);

    if (!numerator || !rawReciprocalFactor || !reciprocalFactor) {
        return false;
    }

    const numericValue = parseNumericLiteral(numerator);
    if (numericValue === null) {
        return false;
    }

    if (Math.abs(numericValue - 1) > computeNumericTolerance(1)) {
        return false;
    }

    const leftClone = Core.cloneAstNode(node.left);
    const rightClone =
        Core.cloneAstNode(rawReciprocalFactor) ??
        Core.cloneAstNode(reciprocalFactor) ??
        reciprocalFactor;

    if (!leftClone || !rightClone) {
        return false;
    }

    node.operator = "*";
    node.left = leftClone;
    node.right = rightClone;

    return true;
}

function attemptCancelReciprocalRatios(node, context) {
    if (!node) {
        return false;
    }

    if (!isBinaryOperator(node, "*") && !isBinaryOperator(node, "/")) {
        return false;
    }

    const chain = {
        numerators: [],
        denominators: []
    };

    if (!collectMultiplicativeChain(node, chain, false, context)) {
        return false;
    }

    if (chain.numerators.length < 2) {
        return false;
    }

    const ratioTerms = [];

    for (const [index, term] of chain.numerators.entries()) {
        if (Core.hasComment(term.raw) || Core.hasComment(term.expression)) {
            return false;
        }

        const expression = unwrapExpression(term.expression);
        if (
            !expression ||
            expression.type !== BINARY_EXPRESSION ||
            expression.operator !== "/"
        ) {
            continue;
        }

        const numerator = unwrapExpression(expression.left);
        const denominator = unwrapExpression(expression.right);

        if (!numerator || !denominator) {
            continue;
        }

        if (
            Core.hasComment(expression.left) ||
            Core.hasComment(expression.right)
        ) {
            return false;
        }

        if (
            context &&
            hasInlineCommentBetween(expression.left, expression.right, context)
        ) {
            return false;
        }

        ratioTerms.push({ index, numerator, denominator });
    }

    if (ratioTerms.length === 0) {
        return false;
    }

    const indicesToRemove = new Set();
    const replacementsByIndex = new Map();
    const ratioIndices = new Set(ratioTerms.map(({ index }) => index));

    for (let outer = 0; outer < ratioTerms.length; outer += 1) {
        if (indicesToRemove.has(ratioTerms[outer].index)) {
            continue;
        }

        for (let inner = outer + 1; inner < ratioTerms.length; inner += 1) {
            if (indicesToRemove.has(ratioTerms[inner].index)) {
                continue;
            }

            const first = ratioTerms[outer];
            const second = ratioTerms[inner];

            if (
                areNodesEquivalent(first.numerator, second.denominator) &&
                areNodesEquivalent(first.denominator, second.numerator)
            ) {
                indicesToRemove.add(first.index);
                indicesToRemove.add(second.index);
                break;
            }
        }
    }

    for (const ratioTerm of ratioTerms) {
        if (indicesToRemove.has(ratioTerm.index)) {
            continue;
        }

        const numerator = ratioTerm.numerator;
        const denominator = ratioTerm.denominator;

        if (!numerator || !denominator) {
            continue;
        }

        for (const [index, term] of chain.numerators.entries()) {
            if (index === ratioTerm.index) {
                continue;
            }

            if (indicesToRemove.has(index)) {
                continue;
            }

            if (ratioIndices.has(index)) {
                continue;
            }

            if (Core.hasComment(term.raw) || Core.hasComment(term.expression)) {
                continue;
            }

            const candidate = unwrapExpression(term.expression);
            if (!candidate) {
                continue;
            }

            if (!areNodesEquivalent(candidate, denominator)) {
                continue;
            }

            const numericValue = parseNumericFactor(numerator);
            const isMultiplicativeIdentity =
                numericValue !== null &&
                Math.abs(numericValue - 1) <= computeNumericTolerance(1);

            if (!isMultiplicativeIdentity) {
                replacementsByIndex.set(ratioTerm.index, [numerator]);
            }
            indicesToRemove.add(ratioTerm.index);
            indicesToRemove.add(index);
            break;
        }
    }

    if (indicesToRemove.size === 0 && replacementsByIndex.size === 0) {
        return false;
    }

    const remainingTerms = [];

    for (const [index, term] of chain.numerators.entries()) {
        if (indicesToRemove.has(index)) {
            const replacements = replacementsByIndex.get(index);
            if (replacements) {
                for (const replacement of replacements) {
                    const clone = Core.cloneAstNode(replacement);
                    if (!clone) {
                        return false;
                    }

                    remainingTerms.push(clone);
                }
            }

            continue;
        }

        const clone = Core.cloneAstNode(term.raw);
        if (!clone) {
            return false;
        }

        remainingTerms.push(clone);
    }

    let replacement;

    if (remainingTerms.length === 0) {
        replacement = createNumericLiteral(1, node);
    } else if (remainingTerms.length === 1) {
        [replacement] = remainingTerms;
    } else {
        let combined = remainingTerms[0];

        for (let index = 1; index < remainingTerms.length; index += 1) {
            const product = {
                type: BINARY_EXPRESSION,
                operator: "*",
                left: combined,
                right: remainingTerms[index]
            };

            Core.assignClonedLocation(product, node);
            combined = product;
        }

        replacement = combined;
    }

    if (!replacement) {
        return false;
    }

    return replaceNodeWith(node, replacement);
}

function attemptSimplifyNegativeDivisionProduct(node, context) {
    if (!isBinaryOperator(node, "*")) {
        return false;
    }

    if (Core.hasComment(node)) {
        return false;
    }

    if (context && hasInlineCommentBetween(node.left, node.right, context)) {
        return false;
    }

    const candidates = [
        { fractionKey: "left", signKey: "right" },
        { fractionKey: "right", signKey: "left" }
    ];

    for (const { fractionKey, signKey } of candidates) {
        const fractionNode = node[fractionKey];
        const signNode = node[signKey];

        if (!isNegativeOneFactor(signNode)) {
            continue;
        }

        if (Core.hasComment(signNode)) {
            continue;
        }

        const fractionExpression = unwrapExpression(fractionNode);
        if (
            !fractionExpression ||
            fractionExpression.type !== BINARY_EXPRESSION ||
            fractionExpression.operator !== "/"
        ) {
            continue;
        }

        if (Core.hasComment(fractionExpression)) {
            continue;
        }

        const numerator = unwrapExpression(fractionExpression.left);
        const denominator = unwrapExpression(fractionExpression.right);

        if (!numerator || !denominator) {
            continue;
        }

        if (
            Core.hasComment(fractionExpression.left) ||
            Core.hasComment(fractionExpression.right)
        ) {
            continue;
        }

        if (
            context &&
            hasInlineCommentBetween(
                fractionExpression.left,
                fractionExpression.right,
                context
            )
        ) {
            continue;
        }

        const denominatorValue = parseNumericFactor(denominator);
        if (denominatorValue === null) {
            continue;
        }

        if (Math.abs(denominatorValue) <= computeNumericTolerance(0)) {
            continue;
        }

        const coefficient = -1 / denominatorValue;
        const normalizedCoefficient = normalizeNumericCoefficient(coefficient);
        if (normalizedCoefficient === null) {
            continue;
        }

        const baseClone = Core.cloneAstNode(numerator);
        const literal = createNumericLiteral(
            normalizedCoefficient,
            denominator
        );

        if (!baseClone || !literal) {
            continue;
        }

        node.operator = "*";
        node.left = baseClone;
        node.right = literal;
        return true;
    }

    return false;
}

function attemptCondenseScalarProduct(node, context) {
    if (!node) {
        return false;
    }

    if (!isBinaryOperator(node, "*") && !isBinaryOperator(node, "/")) {
        return false;
    }

    const chain = {
        numerators: [],
        denominators: []
    };

    if (!collectMultiplicativeChain(node, chain, false, context)) {
        return false;
    }

    if (chain.denominators.length === 0) {
        return false;
    }

    const nonNumericTerms = [];
    let coefficient = 1;
    let hasNumericContribution = false;
    let meaningfulNumericFactorCount = 0;
    let numericNumeratorProduct = 1;
    let numericDenominatorProduct = 1;
    let hasNumericNumeratorFactor = false;
    let hasNumericDenominatorFactor = false;
    let numericDenominatorCount = 0;
    const unitTolerance = computeNumericTolerance(1);

    for (const term of chain.numerators) {
        if (
            Core.hasComment(term.expression) ||
            (term.raw && Core.hasComment(term.raw))
        ) {
            return false;
        }

        const numericValue = parseNumericFactor(term.expression);
        if (numericValue === null) {
            nonNumericTerms.push(term);
            continue;
        }

        hasNumericContribution = true;
        coefficient *= numericValue;
        hasNumericNumeratorFactor = true;
        numericNumeratorProduct *= numericValue;

        if (
            Math.abs(numericValue - 1) > unitTolerance &&
            Math.abs(numericValue + 1) > unitTolerance
        ) {
            meaningfulNumericFactorCount += 1;
        }
    }

    if (nonNumericTerms.length === 0) {
        return false;
    }

    for (const term of chain.denominators) {
        if (
            Core.hasComment(term.expression) ||
            (term.raw && Core.hasComment(term.raw))
        ) {
            return false;
        }

        const numericValue = parseNumericFactor(term.expression);
        if (
            numericValue === null ||
            Math.abs(numericValue) <= computeNumericTolerance(0)
        ) {
            return false;
        }

        hasNumericContribution = true;
        coefficient /= numericValue;
        hasNumericDenominatorFactor = true;
        numericDenominatorProduct *= numericValue;
        numericDenominatorCount += 1;

        if (
            Math.abs(numericValue - 1) > unitTolerance &&
            Math.abs(numericValue + 1) > unitTolerance
        ) {
            meaningfulNumericFactorCount += 1;
        }
    }

    if (!hasNumericContribution) {
        return false;
    }

    if (!Number.isFinite(coefficient)) {
        return false;
    }

    const zeroTolerance = computeNumericTolerance(0);
    const coefficientIsPositiveIdentity =
        Math.abs(coefficient - 1) <= unitTolerance;
    const coefficientIsNegativeIdentity =
        Math.abs(coefficient + 1) <= unitTolerance;

    if (
        (coefficientIsPositiveIdentity || coefficientIsNegativeIdentity) &&
        nonNumericTerms.length > 0
    ) {
        const condensedOperand = cloneMultiplicativeTerms(
            nonNumericTerms,
            node
        );
        if (!condensedOperand) {
            return false;
        }

        const replacement = coefficientIsNegativeIdentity
            ? createUnaryNegationNode(condensedOperand, node)
            : condensedOperand;

        if (!replacement || !replaceNodeWith(node, replacement)) {
            return false;
        }

        unwrapEnclosingParentheses(node, context);

        return true;
    }

    if (Math.abs(coefficient) <= zeroTolerance) {
        return false;
    }

    if (meaningfulNumericFactorCount < 2) {
        const coefficientMagnitude = Math.abs(coefficient);
        if (coefficientMagnitude <= 1 + unitTolerance) {
            return false;
        }
    }

    const ratioMetadata =
        hasNumericDenominatorFactor && numericDenominatorCount >= 2
            ? computeScalarRatioMetadata(
                  coefficient,
                  hasNumericNumeratorFactor ? numericNumeratorProduct : 1,
                  numericDenominatorProduct
              )
            : null;

    const normalizedCoefficient = normalizeNumericCoefficient(
        coefficient,
        ratioMetadata?.precision
    );
    if (normalizedCoefficient === null) {
        return false;
    }

    const clonedOperand = cloneMultiplicativeTerms(nonNumericTerms, node);
    const literal = createNumericLiteral(normalizedCoefficient, node) as any;

    if (!clonedOperand || !literal) {
        return false;
    }

    if (ratioMetadata?.text) {
        literal._gmlManualMathRatio = ratioMetadata.text;
        node._gmlManualMathRatio = ratioMetadata.text;
    }

    node.operator = "*";
    node.left = clonedOperand;
    node.right = literal;

    return true;
}

function computeScalarRatioMetadata(
    coefficient,
    numeratorProduct,
    denominatorProduct
) {
    if (!Number.isFinite(coefficient)) {
        return null;
    }

    if (
        !Number.isFinite(numeratorProduct) ||
        !Number.isFinite(denominatorProduct) ||
        Math.abs(denominatorProduct) <= computeNumericTolerance(1)
    ) {
        return null;
    }

    let numerator = numeratorProduct;
    let denominator = denominatorProduct;

    if (Math.abs(denominator) <= computeNumericTolerance(0)) {
        return null;
    }

    if (denominator < 0) {
        numerator *= -1;
        denominator *= -1;
    }

    const ratioValue = numerator / denominator;
    const tolerance = computeNumericTolerance(coefficient);

    if (Math.abs(coefficient - ratioValue) > tolerance) {
        return null;
    }

    const numeratorInt = toApproxInteger(numerator);
    const denominatorInt = toApproxInteger(denominator);

    if (numeratorInt === null || denominatorInt === null) {
        return null;
    }

    if (denominatorInt === 0) {
        return null;
    }

    let simplifiedNumerator = numeratorInt;
    let simplifiedDenominator = denominatorInt;

    if (simplifiedDenominator < 0) {
        simplifiedNumerator *= -1;
        simplifiedDenominator *= -1;
    }

    const gcdValue = computeIntegerGcd(
        Math.abs(simplifiedNumerator),
        Math.abs(simplifiedDenominator)
    );

    if (!Number.isFinite(gcdValue) || gcdValue <= 0) {
        return null;
    }

    simplifiedNumerator /= gcdValue;
    simplifiedDenominator /= gcdValue;

    if (simplifiedDenominator <= 1) {
        return null;
    }

    const unitTolerance = computeNumericTolerance(1);
    const absNumerator = Math.abs(simplifiedNumerator);
    if (absNumerator < 1 - unitTolerance || absNumerator > 1 + unitTolerance) {
        return null;
    }

    if (Math.abs(simplifiedDenominator) < 100) {
        return null;
    }

    const signPrefix = simplifiedNumerator < 0 ? "-" : "";
    const ratioText = `${signPrefix}1/${simplifiedDenominator}`;

    return {
        text: `(${ratioText})`,
        precision: 11
    };
}

function attemptCondenseNumericChainWithMultipleBases(node, context) {
    if (!node) {
        return false;
    }

    if (!isBinaryOperator(node, "*") && !isBinaryOperator(node, "/")) {
        return false;
    }

    const chain = {
        numerators: [],
        denominators: []
    };

    if (!collectMultiplicativeChain(node, chain, false, context)) {
        return false;
    }

    if (chain.denominators.length === 0) {
        return false;
    }

    let coefficient = 1;
    let hasNumericContribution = false;
    let meaningfulNumericFactorCount = 0;
    const nonNumericTerms = [];
    const unitTolerance = computeNumericTolerance(1);

    for (const term of chain.numerators) {
        if (
            Core.hasComment(term.expression) ||
            (term.raw && Core.hasComment(term.raw))
        ) {
            return false;
        }

        const numericValue = parseNumericFactor(term.expression);
        if (numericValue === null) {
            nonNumericTerms.push(term);
            continue;
        }

        hasNumericContribution = true;
        coefficient *= numericValue;

        if (
            Math.abs(numericValue - 1) > unitTolerance &&
            Math.abs(numericValue + 1) > unitTolerance
        ) {
            meaningfulNumericFactorCount += 1;
        }
    }

    if (nonNumericTerms.length < 2) {
        return false;
    }

    for (const term of chain.denominators) {
        if (
            Core.hasComment(term.expression) ||
            (term.raw && Core.hasComment(term.raw))
        ) {
            return false;
        }

        const numericValue = parseNumericFactor(term.expression);
        if (
            numericValue === null ||
            Math.abs(numericValue) <= computeNumericTolerance(0)
        ) {
            return false;
        }

        hasNumericContribution = true;
        coefficient /= numericValue;

        if (
            Math.abs(numericValue - 1) > unitTolerance &&
            Math.abs(numericValue + 1) > unitTolerance
        ) {
            meaningfulNumericFactorCount += 1;
        }
    }

    if (!hasNumericContribution) {
        return false;
    }

    if (!Number.isFinite(coefficient)) {
        return false;
    }

    const tolerance = computeNumericTolerance(1);
    if (
        Math.abs(coefficient) <= computeNumericTolerance(0) ||
        Math.abs(coefficient - 1) <= tolerance ||
        Math.abs(coefficient + 1) <= tolerance
    ) {
        return false;
    }

    if (meaningfulNumericFactorCount < 2) {
        const magnitude = Math.abs(coefficient);
        if (magnitude <= 1 + unitTolerance) {
            return false;
        }
    }

    const normalizedCoefficient = normalizeNumericCoefficient(coefficient);
    if (normalizedCoefficient === null) {
        return false;
    }

    const clonedOperand = cloneMultiplicativeTerms(nonNumericTerms, node);
    const literal = createNumericLiteral(normalizedCoefficient, node);

    if (!clonedOperand || !literal) {
        return false;
    }

    node.operator = "*";
    node.left = clonedOperand;
    node.right = literal;

    return true;
}

function attemptCollectDistributedScalars(node, context) {
    if (!isBinaryOperator(node, "+") || Core.hasComment(node)) {
        return false;
    }

    if (context && hasInlineCommentBetween(node.left, node.right, context)) {
        return false;
    }

    const terms = [];
    collectAdditionTerms(node, terms);

    if (terms.length < 2) {
        return false;
    }

    let baseDetails = null;
    let coefficient = 0;

    for (const term of terms) {
        const details = extractScalarAdditionTerm(term, context);
        if (
            !details ||
            !details.base ||
            !details.rawBase ||
            details.hasExplicitCoefficient !== true
        ) {
            return false;
        }

        if (!baseDetails) {
            if (!isSafeOperand(details.base)) {
                return false;
            }

            baseDetails = details;
        } else if (!areNodesEquivalent(baseDetails.base, details.base)) {
            return false;
        }

        coefficient += details.coefficient;
    }

    if (!baseDetails || !Number.isFinite(coefficient)) {
        return false;
    }

    const zeroTolerance = computeNumericTolerance(0);
    const unitTolerance = computeNumericTolerance(1);

    if (Math.abs(coefficient) <= zeroTolerance) {
        mutateToNumericLiteral(node, 0, node);
        return true;
    }

    if (Math.abs(coefficient - 1) <= unitTolerance) {
        const baseClone = Core.cloneAstNode(baseDetails.rawBase);
        if (!baseClone) {
            return false;
        }

        replaceNodeWith(node, baseClone);
        return true;
    }

    if (Math.abs(coefficient + 1) <= unitTolerance) {
        const baseClone = Core.cloneAstNode(baseDetails.rawBase);
        if (!baseClone) {
            return false;
        }

        const negated = createNegatedExpression(baseClone, node);
        if (!negated) {
            return false;
        }

        replaceNode(node, negated);
        return true;
    }

    const normalizedCoefficient = normalizeNumericCoefficient(coefficient);
    if (normalizedCoefficient === null) {
        return false;
    }

    const baseClone = Core.cloneAstNode(baseDetails.rawBase);
    const literal = createNumericLiteral(normalizedCoefficient, node);

    if (!baseClone || !literal) {
        return false;
    }

    node.operator = "*";
    node.left = baseClone;
    node.right = literal;

    return true;
}

function attemptConvertDegreesToRadians(node, context) {
    if (
        (!isBinaryOperator(node, "*") && !isBinaryOperator(node, "/")) ||
        hasCommentsInDegreesToRadiansPattern(node, context, true)
    ) {
        return false;
    }

    const angle = matchDegreesToRadians(node);
    if (!angle) {
        return false;
    }

    mutateToCallExpression(node, "degtorad", [Core.cloneAstNode(angle)], node);
    return true;
}

function attemptConvertSquare(node, context) {
    if (!isBinaryOperator(node, "*") || Core.hasComment(node)) {
        return false;
    }

    const rawLeft = node.left;
    const rawRight = node.right;

    if (!rawLeft || !rawRight) {
        return false;
    }

    if (Core.hasComment(rawLeft) || Core.hasComment(rawRight)) {
        return false;
    }

    const left = unwrapExpression(rawLeft);
    const right = unwrapExpression(rawRight);

    if (!left || !right) {
        return false;
    }

    if (Core.hasComment(left) || Core.hasComment(right)) {
        return false;
    }

    if (hasInlineCommentBetween(rawLeft, rawRight, context)) {
        return false;
    }

    if (
        !areNodesEquivalent(left, right) &&
        !areNodesApproximatelyEquivalent(left, right)
    ) {
        return false;
    }

    if (!isSafeOperand(left)) {
        return false;
    }

    mutateToCallExpression(node, "sqr", [Core.cloneAstNode(left)], node);
    return true;
}

function attemptConvertRepeatedPower(node) {
    if (!isBinaryOperator(node, "*") || Core.hasComment(node)) {
        return false;
    }

    const factors = [];
    if (!collectProductOperands(node, factors)) {
        return false;
    }

    if (factors.length <= 2) {
        return false;
    }

    const base = unwrapExpression(factors[0]);
    if (!base || !isSafeOperand(base)) {
        return false;
    }

    for (let index = 1; index < factors.length; index += 1) {
        const operand = unwrapExpression(factors[index]);
        if (!areNodesEquivalent(base, operand)) {
            return false;
        }
    }

    const exponentLiteral = createNumericLiteral(factors.length, node);
    mutateToCallExpression(
        node,
        "power",
        [Core.cloneAstNode(base), exponentLiteral],
        node
    );
    return true;
}

function attemptConvertMean(node) {
    if (Core.hasComment(node)) {
        return false;
    }

    const expression = unwrapExpression(node);

    if (!expression || expression.type !== BINARY_EXPRESSION) {
        return false;
    }

    let addition;
    let divisor;

    if (expression.operator === "/") {
        addition = unwrapExpression(expression.left);
        divisor = unwrapExpression(expression.right);

        if (!isLiteralNumber(divisor, 2)) {
            return false;
        }
    } else if (expression.operator === "*") {
        const left = unwrapExpression(expression.left);
        const right = unwrapExpression(expression.right);

        if (isLiteralNumber(left, 0.5)) {
            addition = right;
        } else if (isLiteralNumber(right, 0.5)) {
            addition = left;
        } else {
            return false;
        }
    } else {
        return false;
    }

    if (!addition || addition.type !== BINARY_EXPRESSION) {
        return false;
    }

    if (Core.hasComment(addition)) {
        return false;
    }

    if (addition.operator !== "+") {
        return false;
    }

    const leftTerm = unwrapExpression(addition.left);
    const rightTerm = unwrapExpression(addition.right);

    if (!leftTerm || !rightTerm) {
        return false;
    }

    mutateToCallExpression(
        node,
        "mean",
        [Core.cloneAstNode(leftTerm), Core.cloneAstNode(rightTerm)],
        node
    );
    return true;
}

function attemptConvertLog2(node) {
    if (!isBinaryOperator(node, "/") || Core.hasComment(node)) {
        return false;
    }

    const numerator = unwrapExpression(node.left);
    const denominator = unwrapExpression(node.right);

    if (!isLnCall(numerator) || !isLnCall(denominator)) {
        return false;
    }

    const [numeratorArg] = numerator.arguments;
    const [denominatorArg] = denominator.arguments;

    if (!numeratorArg || !denominatorArg) {
        return false;
    }

    if (!isLiteralNumber(denominatorArg, 2)) {
        return false;
    }

    mutateToCallExpression(
        node,
        "log2",
        [Core.cloneAstNode(numeratorArg)],
        node
    );
    return true;
}

function attemptConvertLengthDir(node) {
    if (!isBinaryOperator(node, "*") || Core.hasComment(node)) {
        return false;
    }

    const leftInfo = extractSignedOperand(node.left);
    const rightInfo = extractSignedOperand(node.right);

    const candidates = [
        { length: leftInfo, trig: rightInfo },
        { length: rightInfo, trig: leftInfo }
    ];

    for (const candidate of candidates) {
        const trigInfo = identifyTrigCall(candidate.trig.node);
        if (!trigInfo) {
            continue;
        }

        const lengthNode = unwrapExpression(candidate.length.node);
        if (!lengthNode || !isSafeOperand(lengthNode)) {
            continue;
        }

        const overallNegative =
            candidate.length.negative !== candidate.trig.negative;

        if (trigInfo.kind === "cos") {
            if (overallNegative) {
                continue;
            }

            mutateToCallExpression(
                node,
                "lengthdir_x",
                [
                    Core.cloneAstNode(lengthNode),
                    Core.cloneAstNode(trigInfo.argument)
                ],
                node
            );
            return true;
        }

        if (trigInfo.kind === "sin") {
            if (!overallNegative) {
                continue;
            }

            mutateToCallExpression(
                node,
                "lengthdir_y",
                [
                    Core.cloneAstNode(lengthNode),
                    Core.cloneAstNode(trigInfo.argument)
                ],
                node
            );
            return true;
        }
    }

    return false;
}

function attemptConvertDotProducts(node) {
    if (!isBinaryOperator(node, "+") || Core.hasComment(node)) {
        return false;
    }

    const terms = [];
    collectAdditionTerms(node, terms);

    if (terms.length !== 2 && terms.length !== 3) {
        return false;
    }

    const leftVector = [];
    const rightVector = [];

    for (const term of terms) {
        const expr = unwrapExpression(term);

        if (!isBinaryOperator(expr, "*") || Core.hasComment(expr)) {
            return false;
        }

        const left = unwrapExpression(expr.left);
        const right = unwrapExpression(expr.right);

        if (!left || !right) {
            return false;
        }

        leftVector.push(Core.cloneAstNode(left));
        rightVector.push(Core.cloneAstNode(right));
    }

    const functionName = terms.length === 2 ? "dot_product" : "dot_product_3d";

    mutateToCallExpression(
        node,
        functionName,
        [...leftVector, ...rightVector],
        node
    );
    return true;
}

function attemptConvertPointDistanceCall(node) {
    if (Core.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    const callArguments = Core.getCallExpressionArguments(node);

    let distanceExpression;
    if (calleeName === "sqrt") {
        if (callArguments.length !== 1) {
            return false;
        }

        distanceExpression = callArguments[0];
    } else if (calleeName === "power") {
        if (callArguments.length !== 2) {
            return false;
        }

        const exponent = unwrapExpression(callArguments[1]);
        if (!isHalfExponentLiteral(exponent)) {
            return false;
        }

        distanceExpression = callArguments[0];
    } else {
        return false;
    }

    const match = matchSquaredDifferences(distanceExpression);
    if (!match) {
        return false;
    }

    const args = [];
    for (const difference of match) {
        args.push(Core.cloneAstNode(difference.subtrahend));
    }
    for (const difference of match) {
        args.push(Core.cloneAstNode(difference.minuend));
    }

    const functionName =
        match.length === 2 ? "point_distance" : "point_distance_3d";

    mutateToCallExpression(node, functionName, args, node);
    return true;
}

function attemptConvertPowerToSqrt(node) {
    if (Core.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    if (calleeName !== "power") {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);
    if (args.length !== 2) {
        return false;
    }

    const exponent = unwrapExpression(args[1]);
    if (!isHalfExponentLiteral(exponent)) {
        return false;
    }

    mutateToCallExpression(node, "sqrt", [Core.cloneAstNode(args[0])], node);
    return true;
}

function attemptConvertPowerToExp(node) {
    if (Core.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    if (calleeName !== "power") {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);
    if (args.length !== 2) {
        return false;
    }

    const base = unwrapExpression(args[0]);
    const exponent = args[1];

    if (!isEulerLiteral(base)) {
        return false;
    }

    mutateToCallExpression(node, "exp", [Core.cloneAstNode(exponent)], node);
    return true;
}

function attemptConvertPointDirection(node) {
    if (Core.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    if (calleeName !== "arctan2") {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);
    if (args.length !== 2) {
        return false;
    }

    const dy = unwrapExpression(args[0]);
    const dx = unwrapExpression(args[1]);

    const dyDiff = matchDifference(dy);
    const dxDiff = matchDifference(dx);

    if (!dyDiff || !dxDiff) {
        return false;
    }

    mutateToCallExpression(
        node,
        "point_direction",
        [
            Core.cloneAstNode(dxDiff.subtrahend),
            Core.cloneAstNode(dyDiff.subtrahend),
            Core.cloneAstNode(dxDiff.minuend),
            Core.cloneAstNode(dyDiff.minuend)
        ],
        node
    );
    return true;
}

function attemptConvertTrigDegreeArguments(node) {
    if (Core.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    if (calleeName !== "sin" && calleeName !== "cos") {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);
    if (args.length !== 1) {
        return false;
    }

    const argument = args[0];
    const angle = matchDegreesToRadians(argument);

    if (!angle) {
        return false;
    }

    node.arguments = [
        createCallExpressionNode(
            "degtorad",
            [Core.cloneAstNode(angle)],
            argument
        )
    ];

    return true;
}

function matchSquaredDifferences(expression) {
    const terms = [];
    collectAdditionTerms(expression, terms);

    if (terms.length < 2 || terms.length > 3) {
        return null;
    }

    const differences = [];

    for (const term of terms) {
        const product = unwrapExpression(term);
        if (!isBinaryOperator(product, "*") || Core.hasComment(product)) {
            return null;
        }

        const left = unwrapExpression(product.left);
        const right = unwrapExpression(product.right);

        if (
            !left ||
            !right ||
            (!areNodesEquivalent(left, right) &&
                !areNodesApproximatelyEquivalent(left, right))
        ) {
            return null;
        }

        const difference = matchDifference(left);
        if (!difference) {
            return null;
        }

        differences.push(difference);
    }

    if (differences.length < 2) {
        return null;
    }

    return differences;
}

function matchDifference(node) {
    const expression = unwrapExpression(node);

    if (!isBinaryOperator(expression, "-")) {
        return null;
    }

    const minuend = unwrapExpression(expression.left);
    const subtrahend = unwrapExpression(expression.right);

    if (!minuend || !subtrahend) {
        return null;
    }

    return { minuend, subtrahend };
}

function collectAdditionTerms(node, output) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return;
    }

    if (expression.type === BINARY_EXPRESSION && expression.operator === "+") {
        collectAdditionTerms(expression.left, output);
        collectAdditionTerms(expression.right, output);
        return;
    }

    output.push(expression);
}

function matchScaledOperand(node, context) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return null;
    }

    if (Core.hasComment(expression)) {
        return null;
    }

    if (expression.type === UNARY_EXPRESSION) {
        if (expression.operator === "-" || expression.operator === "+") {
            const inner = matchScaledOperand(expression.argument, context);

            if (!inner) {
                return null;
            }

            const coefficient =
                expression.operator === "-"
                    ? -inner.coefficient
                    : inner.coefficient;

            return {
                coefficient,
                base: inner.base,
                rawBase: inner.rawBase
            };
        }

        return null;
    }

    if (expression.type === BINARY_EXPRESSION) {
        const rawLeft = expression.left;
        const rawRight = expression.right;

        if (!rawLeft || !rawRight) {
            return null;
        }

        if (
            Core.hasComment(rawLeft) ||
            Core.hasComment(rawRight) ||
            (context && hasInlineCommentBetween(rawLeft, rawRight, context))
        ) {
            return null;
        }

        const leftValue = parseNumericFactor(rawLeft);
        const rightValue = parseNumericFactor(rawRight);

        if (expression.operator === "*") {
            const rightBase = unwrapExpression(rawRight);
            if (leftValue !== null && rightValue === null && rightBase) {
                return {
                    coefficient: leftValue,
                    base: rightBase,
                    rawBase: rawRight
                };
            }

            const leftBase = unwrapExpression(rawLeft);
            if (rightValue !== null && leftValue === null && leftBase) {
                return {
                    coefficient: rightValue,
                    base: leftBase,
                    rawBase: rawLeft
                };
            }

            return null;
        }

        if (expression.operator === "/") {
            if (rightValue === null) {
                return null;
            }

            if (Math.abs(rightValue) <= computeNumericTolerance(0)) {
                return null;
            }

            const numerator = unwrapExpression(rawLeft);
            if (!numerator) {
                return null;
            }

            return {
                coefficient: 1 / rightValue,
                base: numerator,
                rawBase: rawLeft
            };
        }
    }

    return null;
}

function matchLengthdirScaledOperand(node, context) {
    const expression = unwrapExpression(node);
    if (!expression || expression.type !== CALL_EXPRESSION) {
        return null;
    }

    const calleeName = getIdentifierName(expression.object);
    if (calleeName !== "lengthdir_x" && calleeName !== "lengthdir_y") {
        return null;
    }

    const args = Core.getCallExpressionArguments(expression);
    if (args.length !== 2) {
        return null;
    }

    const [rawLength, rawAngle] = args;

    if (!rawLength || !rawAngle) {
        return null;
    }

    if (
        Core.hasComment(rawLength) ||
        Core.hasComment(rawAngle) ||
        (context && hasInlineCommentBetween(rawLength, rawAngle, context))
    ) {
        return null;
    }

    const scaledInfo = matchScaledOperand(rawLength, context);
    if (!scaledInfo || !scaledInfo.base) {
        return null;
    }

    return {
        calleeName,
        coefficient: scaledInfo.coefficient,
        base: scaledInfo.base,
        rawLength,
        angle: rawAngle
    };
}

function extractScalarAdditionTerm(expression, context) {
    if (!expression || Core.hasComment(expression)) {
        return null;
    }

    if (expression.type === BINARY_EXPRESSION && expression.operator === "*") {
        const rawLeft = expression.left;
        const rawRight = expression.right;

        if (!rawLeft || !rawRight) {
            return null;
        }

        if (
            Core.hasComment(rawLeft) ||
            Core.hasComment(rawRight) ||
            (context && hasInlineCommentBetween(rawLeft, rawRight, context))
        ) {
            return null;
        }

        const left = unwrapExpression(rawLeft);
        const right = unwrapExpression(rawRight);

        if (!left || !right) {
            return null;
        }

        if (Core.hasComment(left) || Core.hasComment(right)) {
            return null;
        }

        const leftValue = parseNumericFactor(left);
        const rightValue = parseNumericFactor(right);

        if (leftValue !== null && rightValue !== null) {
            return null;
        }

        if (leftValue !== null) {
            return {
                coefficient: leftValue,
                base: right,
                rawBase: rawRight,
                hasExplicitCoefficient: true
            };
        }

        if (rightValue !== null) {
            return {
                coefficient: rightValue,
                base: left,
                rawBase: rawLeft,
                hasExplicitCoefficient: true
            };
        }

        return null;
    }

    const literalValue = parseNumericFactor(expression);
    if (literalValue !== null) {
        return {
            coefficient: literalValue,
            base: null,
            rawBase: null,
            hasExplicitCoefficient: false
        };
    }

    return {
        coefficient: 1,
        base: expression,
        rawBase: expression,
        hasExplicitCoefficient: false
    };
}

function attemptSimplifyLengthdirHalfDifference(node, context) {
    if (!isBinaryOperator(node, "-") || Core.hasComment(node)) {
        return false;
    }

    const rawLeft = node.left;
    const rawRight = node.right;

    if (!rawLeft || !rawRight) {
        return false;
    }

    if (
        Core.hasComment(rawLeft) ||
        Core.hasComment(rawRight) ||
        (context && hasInlineCommentBetween(rawLeft, rawRight, context))
    ) {
        return false;
    }

    const leftExpression = unwrapExpression(rawLeft);
    const rightExpression = unwrapExpression(rawRight);

    if (!leftExpression || !rightExpression) {
        return false;
    }

    if (Core.hasComment(leftExpression) || Core.hasComment(rightExpression)) {
        return false;
    }

    if (
        !isBinaryOperator(leftExpression, "-") ||
        Core.hasComment(leftExpression) ||
        (context &&
            hasInlineCommentBetween(
                leftExpression.left,
                leftExpression.right,
                context
            ))
    ) {
        return false;
    }

    const minuend = unwrapExpression(leftExpression.left);
    const identifierName = getIdentifierName(minuend);
    const scaledOperandInfo = matchScaledOperand(leftExpression.right, context);

    if (!minuend || !scaledOperandInfo || !scaledOperandInfo.base) {
        return false;
    }

    if (!isSafeOperand(minuend)) {
        return false;
    }

    const lengthDirInfo = matchLengthdirScaledOperand(rightExpression, context);

    if (!lengthDirInfo || !lengthDirInfo.base) {
        return false;
    }

    if (
        !areNodesEquivalent(minuend, scaledOperandInfo.base) ||
        !areNodesEquivalent(minuend, lengthDirInfo.base)
    ) {
        return false;
    }

    const scaledCoefficient = scaledOperandInfo.coefficient;
    const lengthCoefficient = lengthDirInfo.coefficient;

    if (
        scaledCoefficient === null ||
        lengthCoefficient === null ||
        !Number.isFinite(scaledCoefficient) ||
        !Number.isFinite(lengthCoefficient)
    ) {
        return false;
    }

    const halfTolerance = computeNumericTolerance(0.5);

    if (
        Math.abs(scaledCoefficient - 0.5) > halfTolerance ||
        Math.abs(lengthCoefficient - 0.5) > halfTolerance
    ) {
        return false;
    }

    const baseClone = Core.cloneAstNode(leftExpression.left);
    if (!baseClone) {
        return false;
    }

    const normalizedCoefficient =
        normalizeNumericCoefficient(scaledCoefficient);
    if (normalizedCoefficient === null) {
        return false;
    }

    const coefficientLiteral = createNumericLiteral(
        normalizedCoefficient,
        leftExpression.right
    );

    if (!coefficientLiteral) {
        return false;
    }

    const oneLiteral = createNumericLiteral(1, node);
    if (!oneLiteral) {
        return false;
    }

    const angleClone = Core.cloneAstNode(lengthDirInfo.angle);
    if (!angleClone) {
        return false;
    }

    const normalizedLengthArg = createNumericLiteral(
        1,
        lengthDirInfo.rawLength
    );
    if (!normalizedLengthArg) {
        return false;
    }

    const normalizedLengthCall = createCallExpressionNode(
        lengthDirInfo.calleeName,
        [normalizedLengthArg, angleClone],
        rightExpression
    );

    if (!normalizedLengthCall) {
        return false;
    }

    const difference = {
        type: BINARY_EXPRESSION,
        operator: "-",
        left: oneLiteral,
        right: normalizedLengthCall
    };

    Core.assignClonedLocation(difference, node);

    const groupedDifference = {
        type: PARENTHESIZED_EXPRESSION,
        expression: difference
    };

    Core.assignClonedLocation(groupedDifference, node);

    const baseTimesCoefficient = createMultiplicationNode(
        baseClone,
        coefficientLiteral,
        node
    );

    if (!baseTimesCoefficient) {
        return false;
    }

    const finalProduct = createMultiplicationNode(
        baseTimesCoefficient,
        groupedDifference,
        node
    );

    if (!finalProduct) {
        return false;
    }

    replaceNode(node, finalProduct);

    promoteLengthdirHalfDifference(
        context,
        node,
        identifierName,
        normalizedCoefficient,
        groupedDifference
    );
    return true;
}

function promoteLengthdirHalfDifference(
    context,
    expressionNode,
    identifierName,
    normalizedCoefficient,
    groupedDifference
) {
    if (
        !context ||
        typeof context !== "object" ||
        !expressionNode ||
        typeof normalizedCoefficient !== "string"
    ) {
        return;
    }

    if (typeof identifierName !== "string" || identifierName.length === 0) {
        return;
    }

    const root = context.astRoot;
    if (!root || typeof root !== "object") {
        return;
    }

    const assignment = findAssignmentExpressionForRight(root, expressionNode);
    if (!assignment) {
        return;
    }

    if (getIdentifierName(assignment.left) !== identifierName) {
        return;
    }

    const declaration = findVariableDeclarationByName(root, identifierName);
    const declarator = Array.isArray(declaration?.declarations)
        ? declaration.declarations[0]
        : null;

    if (!declarator || !declarator.init) {
        return;
    }

    const baseClone = Core.cloneAstNode(declarator.init);
    if (!baseClone) {
        return;
    }

    const differenceClone = Core.cloneAstNode(groupedDifference);
    if (!differenceClone) {
        return;
    }

    let leftProduct = null;
    const baseInfo = matchScaledOperand(declarator.init, context);

    if (baseInfo && baseInfo.coefficient !== null && baseInfo.rawBase) {
        const combinedValue =
            baseInfo.coefficient * Number(normalizedCoefficient);

        if (Number.isFinite(combinedValue)) {
            const combinedLiteralText =
                normalizeNumericCoefficient(combinedValue);

            if (combinedLiteralText !== null) {
                const baseNodeClone = Core.cloneAstNode(baseInfo.rawBase);
                const literalClone = createNumericLiteral(
                    combinedLiteralText,
                    baseInfo.rawBase
                );

                if (baseNodeClone && literalClone) {
                    leftProduct = createMultiplicationNode(
                        baseNodeClone,
                        literalClone,
                        declarator.init
                    );
                }
            }
        }
    }

    if (!leftProduct) {
        const coefficientLiteral = createNumericLiteral(
            normalizedCoefficient,
            declarator.init
        );

        if (!coefficientLiteral) {
            return;
        }

        leftProduct = createMultiplicationNode(
            baseClone,
            coefficientLiteral,
            declarator.init
        );

        if (!leftProduct) {
            return;
        }
    }

    const newInit = createMultiplicationNode(
        leftProduct,
        differenceClone,
        declarator.init
    );

    if (!newInit) {
        return;
    }

    replaceNode(declarator.init, newInit);

    attemptCondenseScalarProduct(newInit, context);
    attemptCondenseNumericChainWithMultipleBases(newInit, context);
    attemptCollectDistributedScalars(newInit, context);

    markPreviousSiblingForBlankLine(root, assignment, context);
    removeNodeFromAst(root, assignment);
}

function collectMultiplicativeChain(
    node,
    output,
    includeInDenominator,
    context
) {
    collapseUnitMinusHalfFactor(node, context);

    const expression = unwrapExpression(node);
    if (!expression) {
        return false;
    }

    if (expression.type === BINARY_EXPRESSION) {
        const operator = expression.operator;

        if (operator === "*" || operator === "/") {
            if (
                context &&
                hasInlineCommentBetween(
                    expression.left,
                    expression.right,
                    context
                )
            ) {
                return false;
            }

            if (operator === "/") {
                const rightExpression = unwrapExpression(expression.right);
                if (!rightExpression) {
                    return false;
                }

                if (parseNumericFactor(rightExpression) === null) {
                    const collection = includeInDenominator
                        ? output.denominators
                        : output.numerators;

                    collection.push({ raw: node, expression });
                    return true;
                }
            }

            if (
                !collectMultiplicativeChain(
                    expression.left,
                    output,
                    includeInDenominator,
                    context
                )
            ) {
                return false;
            }

            if (operator === "/") {
                return collectMultiplicativeChain(
                    expression.right,
                    output,
                    !includeInDenominator,
                    context
                );
            }

            return collectMultiplicativeChain(
                expression.right,
                output,
                includeInDenominator,
                context
            );
        }
    }

    const collection = includeInDenominator
        ? output.denominators
        : output.numerators;

    collection.push({ raw: node, expression });
    return true;
}

function cloneMultiplicativeTerms(terms, template) {
    if (!Array.isArray(terms) || terms.length === 0) {
        return null;
    }

    const first = terms[0];
    const baseClone = Core.cloneAstNode(first?.raw ?? first?.expression);
    if (!baseClone) {
        return null;
    }

    let result = baseClone;

    for (let index = 1; index < terms.length; index += 1) {
        const current = terms[index];
        const operand = Core.cloneAstNode(current?.raw ?? current?.expression);

        if (!operand) {
            return null;
        }

        const product = createMultiplicationNode(result, operand, template);
        if (!product) {
            return null;
        }

        result = product;
    }

    return result;
}

function createMultiplicationNode(left, right, template) {
    if (!left || !right) {
        return null;
    }

    const expression = {
        type: BINARY_EXPRESSION,
        operator: "*",
        left,
        right
    };

    Core.assignClonedLocation(expression, template);

    return expression;
}

function createUnaryNegationNode(argument, template) {
    if (!argument) {
        return null;
    }

    const expression = {
        type: UNARY_EXPRESSION,
        operator: "-",
        prefix: true,
        argument
    };

    Core.assignClonedLocation(expression, template);

    return expression;
}

function collapseUnitMinusHalfFactor(node, context) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type !== PARENTHESIZED_EXPRESSION || Core.hasComment(node)) {
        return false;
    }

    const difference = unwrapExpression(node.expression);

    if (!difference || difference.type !== BINARY_EXPRESSION) {
        return false;
    }

    if (difference.operator !== "-") {
        return false;
    }

    if (Core.hasComment(difference)) {
        return false;
    }

    const rawLeft = difference.left;
    const rawRight = difference.right;

    if (!rawLeft || !rawRight) {
        return false;
    }

    if (Core.hasComment(rawLeft) || Core.hasComment(rawRight)) {
        return false;
    }

    if (context && hasInlineCommentBetween(rawLeft, rawRight, context)) {
        return false;
    }

    const leftValue = parseNumericFactor(rawLeft);
    const rightValue = parseNumericFactor(rawRight);

    if (leftValue === null || rightValue === null) {
        return false;
    }

    const unitTolerance = computeNumericTolerance(1);
    const halfTolerance = computeNumericTolerance(0.5);

    if (Math.abs(leftValue - 1) > unitTolerance) {
        return false;
    }

    if (Math.abs(rightValue - 0.5) > halfTolerance) {
        return false;
    }

    mutateToNumericLiteral(node, 0.5, node);
    return true;
}

function collectProductOperands(node, output) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return false;
    }

    if (!isBinaryOperator(expression, "*")) {
        output.push(expression);
        return true;
    }

    if (Core.hasComment(expression)) {
        return false;
    }

    return (
        collectProductOperands(expression.left, output) &&
        collectProductOperands(expression.right, output)
    );
}

function extractSignedOperand(node) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return { node: null, negative: false };
    }

    if (expression.type === UNARY_EXPRESSION && expression.operator === "-") {
        return {
            node: expression.argument,
            negative: true
        };
    }

    return { node: expression, negative: false };
}

function identifyTrigCall(node) {
    const expression = unwrapExpression(node);
    if (!expression || expression.type !== CALL_EXPRESSION) {
        return null;
    }

    const calleeName = getIdentifierName(expression.object);
    if (
        !Array.isArray(expression.arguments) ||
        expression.arguments.length !== 1
    ) {
        return null;
    }

    const [argument] = expression.arguments;

    if (calleeName === "dcos") {
        return { kind: "cos", argument: unwrapExpression(argument) };
    }

    if (calleeName === "dsin") {
        return { kind: "sin", argument: unwrapExpression(argument) };
    }

    if (calleeName === "cos") {
        const degArg = matchDegToRadCall(argument);
        if (!degArg) {
            return null;
        }
        return { kind: "cos", argument: degArg };
    }

    if (calleeName === "sin") {
        const degArg = matchDegToRadCall(argument);
        if (!degArg) {
            return null;
        }
        return { kind: "sin", argument: degArg };
    }

    return null;
}

function matchDegToRadCall(argument) {
    const expression = unwrapExpression(argument);
    if (
        !expression ||
        expression.type !== CALL_EXPRESSION ||
        getIdentifierName(expression.object) !== "degtorad" ||
        !Array.isArray(expression.arguments) ||
        expression.arguments.length !== 1
    ) {
        return null;
    }

    return unwrapExpression(expression.arguments[0]);
}

function matchDegreesToRadians(node) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return null;
    }

    if (isBinaryOperator(expression, "/")) {
        const left = unwrapExpression(expression.left);
        const right = unwrapExpression(expression.right);

        if (!isLiteralNumber(right, 180)) {
            return null;
        }

        if (isBinaryOperator(left, "*")) {
            const factorA = unwrapExpression(left.left);
            const factorB = unwrapExpression(left.right);

            if (isPiIdentifier(factorA)) {
                return factorB;
            }

            if (isPiIdentifier(factorB)) {
                return factorA;
            }
        }
    }

    if (isBinaryOperator(expression, "*")) {
        const left = unwrapExpression(expression.left);
        const right = unwrapExpression(expression.right);

        if (isLiteralNumber(left, 0.017_453_292_519_943_295)) {
            return right;
        }

        if (isLiteralNumber(right, 0.017_453_292_519_943_295)) {
            return left;
        }

        if (isBinaryOperator(left, "/")) {
            const numerator = unwrapExpression(left.left);
            const denominator = unwrapExpression(left.right);

            if (isPiIdentifier(right) && isLiteralNumber(denominator, 180)) {
                return numerator;
            }
        }

        if (isBinaryOperator(right, "/")) {
            const numerator = unwrapExpression(right.left);
            const denominator = unwrapExpression(right.right);

            if (isPiIdentifier(left) && isLiteralNumber(denominator, 180)) {
                return numerator;
            }
        }
    }

    return null;
}

function hasCommentsInDegreesToRadiansPattern(
    node,
    context,
    skipSelfCheck = false
) {
    const expression = unwrapExpression(node);
    if (!expression || expression.type !== BINARY_EXPRESSION) {
        return false;
    }

    const operator =
        typeof expression.operator === "string"
            ? expression.operator.toLowerCase()
            : null;

    if (operator !== "*" && operator !== "/") {
        return false;
    }

    const rawLeft = expression.left;
    const rawRight = expression.right;

    if (!rawLeft || !rawRight) {
        return true;
    }

    if (
        (!skipSelfCheck && Core.hasComment(expression)) ||
        Core.hasComment(rawLeft) ||
        Core.hasComment(rawRight)
    ) {
        return true;
    }

    if (context && hasInlineCommentBetween(rawLeft, rawRight, context)) {
        return true;
    }

    return (
        hasCommentsInDegreesToRadiansPattern(rawLeft, context) ||
        hasCommentsInDegreesToRadiansPattern(rawRight, context)
    );
}

function isBinaryOperator(node, operator) {
    return (
        node &&
        node.type === BINARY_EXPRESSION &&
        typeof node.operator === "string" &&
        node.operator.toLowerCase() === operator
    );
}

function computeNumericTolerance(expected, providedTolerance?) {
    if (typeof providedTolerance === "number") {
        return providedTolerance;
    }

    const magnitude = Math.max(1, Math.abs(expected));
    return Number.EPSILON * magnitude * 4;
}

function normalizeNumericCoefficient(
    value: number,
    precision = 12
): string | null {
    if (!Number.isFinite(value)) {
        return null;
    }

    const effectivePrecision = Number.isInteger(precision) ? precision : 12;

    const rounded = Number(value.toPrecision(effectivePrecision));
    if (!Number.isFinite(rounded)) {
        return null;
    }

    if (Object.is(rounded, -0)) {
        return "0";
    }

    return rounded.toString();
}

function toApproxInteger(value) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const rounded = Math.round(value);
    const tolerance = computeNumericTolerance(Math.max(1, Math.abs(value)));

    if (Math.abs(value - rounded) <= tolerance) {
        return rounded;
    }

    return null;
}

function computeIntegerGcd(a, b) {
    let left = Math.abs(a);
    let right = Math.abs(b);

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
        return 0;
    }

    while (right !== 0) {
        const temp = right;
        right = left % right;
        left = temp;
    }

    return left;
}

function areLiteralNumbersApproximatelyEqual(left, right) {
    const tolerance = Math.max(
        computeNumericTolerance(left),
        computeNumericTolerance(right)
    );

    return Math.abs(left - right) <= tolerance;
}

function isLiteralNumber(node, expected, tolerance?) {
    const value = parseNumericLiteral(node);
    if (value === undefined || value === null) {
        return false;
    }

    const effectiveTolerance = computeNumericTolerance(expected, tolerance);
    return Math.abs(value - expected) <= effectiveTolerance;
}

function isHalfExponentLiteral(node) {
    if (!node) {
        return false;
    }

    if (isLiteralNumber(node, 0.5)) {
        return true;
    }

    if (isBinaryOperator(node, "/")) {
        return isLiteralNumber(node.left, 1) && isLiteralNumber(node.right, 2);
    }

    return false;
}

function isEulerLiteral(node) {
    const value = parseNumericLiteral(node);
    if (value == undefined) {
        return false;
    }

    return Math.abs(value - Math.E) <= 1e-9;
}

function parseNumericLiteral(node) {
    if (!node || node.type !== LITERAL) {
        return null;
    }

    const raw = node.value;
    if (typeof raw === "number") {
        return Number.isFinite(raw) ? raw : null;
    }

    if (typeof raw === "string") {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function evaluateNumericExpression(node) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return null;
    }

    if (expression.type === LITERAL) {
        return parseNumericLiteral(expression);
    }

    if (expression.type === UNARY_EXPRESSION) {
        const value = evaluateNumericExpression(expression.argument);
        if (value === null) {
            return null;
        }

        if (expression.operator === "-") {
            return -value;
        }

        if (expression.operator === "+") {
            return value;
        }

        return null;
    }

    if (expression.type === BINARY_EXPRESSION) {
        const operator =
            typeof expression.operator === "string"
                ? expression.operator.toLowerCase()
                : null;

        if (operator === "+" || operator === "-") {
            const left = evaluateNumericExpression(expression.left);
            const right = evaluateNumericExpression(expression.right);

            if (left === null || right === null) {
                return null;
            }

            return operator === "+" ? left + right : left - right;
        }

        if (operator === "*" || operator === "/") {
            const left = evaluateNumericExpression(expression.left);
            const right = evaluateNumericExpression(expression.right);

            if (left === null || right === null) {
                return null;
            }

            if (operator === "*") {
                return left * right;
            }

            if (Math.abs(right) <= computeNumericTolerance(0)) {
                return null;
            }

            return left / right;
        }
    }

    return null;
}

function isNegativeOneFactor(node) {
    const value = parseNumericFactor(node);
    if (value === null) {
        return false;
    }

    return Math.abs(value + 1) <= computeNumericTolerance(1);
}

function evaluateOneMinusNumeric(node) {
    const expression = unwrapExpression(node);
    if (!expression || expression.type !== BINARY_EXPRESSION) {
        return null;
    }

    const operator =
        typeof expression.operator === "string"
            ? expression.operator.toLowerCase()
            : null;

    if (operator !== "-") {
        return null;
    }

    const leftValue = evaluateNumericExpression(expression.left);
    if (leftValue === null) {
        return null;
    }

    const tolerance = computeNumericTolerance(1);
    if (Math.abs(leftValue - 1) > tolerance) {
        return null;
    }

    const rightValue = evaluateNumericExpression(expression.right);
    if (rightValue === null) {
        return null;
    }

    return leftValue - rightValue;
}

function parseNumericFactor(node) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return null;
    }

    if (expression.type === BINARY_EXPRESSION) {
        const operator =
            typeof expression.operator === "string"
                ? expression.operator.toLowerCase()
                : null;

        if (operator === "*" || operator === "/") {
            const leftValue = parseNumericFactor(expression.left);
            const rightValue = parseNumericFactor(expression.right);

            if (leftValue === null || rightValue === null) {
                return null;
            }

            if (operator === "*") {
                return leftValue * rightValue;
            }

            if (Math.abs(rightValue) <= computeNumericTolerance(0)) {
                return null;
            }

            return leftValue / rightValue;
        }
    }

    if (expression.type === UNARY_EXPRESSION) {
        const value = parseNumericFactor(expression.argument);
        if (value === null) {
            return null;
        }

        if (expression.operator === "-") {
            return -value;
        }

        if (expression.operator === "+") {
            return value;
        }

        return null;
    }

    const literalValue = parseNumericLiteral(expression);
    return literalValue ?? null;
}

function isPiIdentifier(node) {
    const expression = unwrapExpression(node);
    return (
        expression &&
        expression.type === IDENTIFIER &&
        typeof expression.name === "string" &&
        expression.name.toLowerCase() === "pi"
    );
}

function areNodesApproximatelyEquivalent(a, b) {
    if (areNodesEquivalent(a, b)) {
        return true;
    }

    const left = unwrapExpression(a);
    const right = unwrapExpression(b);

    if (!left || !right || left.type !== right.type) {
        return false;
    }

    switch (left.type) {
        case IDENTIFIER: {
            return left.name === right.name;
        }
        case LITERAL: {
            const leftNumber = parseNumericLiteral(left);
            const rightNumber = parseNumericLiteral(right);

            if (
                typeof leftNumber === "number" &&
                typeof rightNumber === "number"
            ) {
                return areLiteralNumbersApproximatelyEqual(
                    leftNumber,
                    rightNumber
                );
            }

            return false;
        }
        case BINARY_EXPRESSION: {
            return (
                left.operator === right.operator &&
                areNodesApproximatelyEquivalent(left.left, right.left) &&
                areNodesApproximatelyEquivalent(left.right, right.right)
            );
        }
        case UNARY_EXPRESSION: {
            return (
                left.operator === right.operator &&
                areNodesApproximatelyEquivalent(left.argument, right.argument)
            );
        }
        default: {
            return false;
        }
    }
}

function areNodesEquivalent(a, b) {
    const left = unwrapExpression(a);
    const right = unwrapExpression(b);

    if (left === right) {
        return true;
    }

    if (!left || !right || left.type !== right.type) {
        return false;
    }

    switch (left.type) {
        case IDENTIFIER: {
            return left.name === right.name;
        }
        case LITERAL: {
            return left.value === right.value;
        }
        case MEMBER_DOT_EXPRESSION: {
            return (
                areNodesEquivalent(left.object, right.object) &&
                areNodesEquivalent(left.property, right.property)
            );
        }
        case MEMBER_INDEX_EXPRESSION: {
            return (
                areNodesEquivalent(left.object, right.object) &&
                compareIndexProperties(left.property, right.property)
            );
        }
        case BINARY_EXPRESSION: {
            return (
                left.operator === right.operator &&
                areNodesEquivalent(left.left, right.left) &&
                areNodesEquivalent(left.right, right.right)
            );
        }
        case UNARY_EXPRESSION: {
            return (
                left.operator === right.operator &&
                areNodesEquivalent(left.argument, right.argument)
            );
        }
        case CALL_EXPRESSION: {
            const leftName = getIdentifierName(left.object);
            const rightName = getIdentifierName(right.object);

            if (leftName !== rightName) {
                return false;
            }

            const leftArgs = Array.isArray(left.arguments)
                ? left.arguments
                : [];
            const rightArgs = Array.isArray(right.arguments)
                ? right.arguments
                : [];

            if (leftArgs.length !== rightArgs.length) {
                return false;
            }

            for (const [index, leftArg] of leftArgs.entries()) {
                if (!areNodesEquivalent(leftArg, rightArgs[index])) {
                    return false;
                }
            }

            return true;
        }
        default: {
            return false;
        }
    }
}

function compareIndexProperties(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false;
    }

    for (const [index, element] of a.entries()) {
        if (!areNodesEquivalent(element, b[index])) {
            return false;
        }
    }

    return true;
}

function isSafeOperand(node) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return false;
    }

    switch (expression.type) {
        case IDENTIFIER: {
            return typeof expression.name === "string";
        }
        case MEMBER_DOT_EXPRESSION:
        case MEMBER_INDEX_EXPRESSION: {
            return (
                isSafeOperand(expression.object) &&
                (expression.type === MEMBER_DOT_EXPRESSION
                    ? isSafeOperand(expression.property)
                    : areAllSafe(expression.property))
            );
        }
        case LITERAL: {
            return true;
        }
        default: {
            return false;
        }
    }
}

function areAllSafe(nodes) {
    if (!Array.isArray(nodes)) {
        return false;
    }

    return nodes.every((node) => isSafeOperand(node));
}

function unwrapExpression(node) {
    let current = node;

    while (
        current &&
        typeof current === "object" &&
        current.type === PARENTHESIZED_EXPRESSION &&
        current.expression
    ) {
        current = current.expression;
    }

    return current ?? null;
}

function getIdentifierName(node) {
    // TODO: This should be moved to where the other identifier utilities are. Also, I think this may be duplciated fucntionality.
    const expression = unwrapExpression(node);
    if (!expression || expression.type !== IDENTIFIER) {
        return null;
    }

    return expression.name ?? null;
}

function mutateToCallExpression(target, name, args, template) {
    const call = createCallExpressionNode(name, args, template);

    if (!call) {
        return;
    }

    replaceNode(target, call);
}

function mutateToNumericLiteral(target, value, template) {
    const literal = createNumericLiteral(value, template);

    if (!literal) {
        return;
    }

    replaceNode(target, literal);
}

function createNegatedExpression(argument, template) {
    if (!argument || typeof argument !== "object") {
        return null;
    }

    const unary = {
        type: UNARY_EXPRESSION,
        operator: "-",
        prefix: true,
        argument
    };

    Core.assignClonedLocation(unary, template);

    return unary;
}

function createCallExpressionNode(name, args, template) {
    const identifier = Core.createIdentifierNode(name, template);
    if (!identifier) {
        return null;
    }

    const call = {
        type: CALL_EXPRESSION,
        object: identifier,
        arguments: Core.toMutableArray(args)
    };

    Core.assignClonedLocation(call, template);

    return call;
}

function createNumericLiteral(value, template) {
    const literal = {
        type: LITERAL,
        value: String(value)
    };

    Core.assignClonedLocation(literal, template);

    return literal;
}

function replaceNodeWith(target, source) {
    const replacement = Core.cloneAstNode(source) ?? source;
    if (!replacement || typeof replacement !== "object") {
        return false;
    }

    for (const key of Object.keys(target)) {
        if (key === "parent") {
            continue;
        }

        delete target[key];
    }

    for (const [key, value] of Object.entries(replacement)) {
        if (key === "parent") {
            continue;
        }

        target[key] = value;
    }

    return true;
}

function recordManualMathOriginalAssignment(context, node, originalExpression) {
    if (!context || typeof context !== "object") {
        return;
    }

    const root = context.astRoot;
    if (!root || typeof root !== "object") {
        return;
    }

    if (!originalExpression || typeof originalExpression !== "object") {
        return;
    }

    const declarator = findVariableDeclaratorForInit(root, node);
    if (!declarator) {
        return;
    }

    const baseName = getIdentifierName(declarator.id);
    if (typeof baseName !== "string" || baseName.length === 0) {
        return;
    }

    const declaration = findVariableDeclarationByName(root, baseName);
    if (!declaration || declaration._gmlManualMathOriginalRecorded === true) {
        return;
    }

    const originalDeclaration = Core.cloneAstNode(declaration);
    if (!Core.isNode(originalDeclaration)) {
        return;
    }

    const clonedDeclaration = originalDeclaration as MutableGameMakerAstNode;

    const declarators = Array.isArray(clonedDeclaration.declarations)
        ? clonedDeclaration.declarations
        : null;
    if (!declarators || declarators.length === 0) {
        return;
    }

    const [originalDeclarator] = declarators;
    originalDeclarator.init =
        Core.cloneAstNode(originalExpression) ?? originalExpression;

    clonedDeclaration._gmlManualMathOriginal = true;
    clonedDeclaration._gmlManualMathOriginalComment = "original";
    if (clonedDeclaration._gmlForceFollowingEmptyLine === true) {
        delete clonedDeclaration._gmlForceFollowingEmptyLine;
    }
    clonedDeclaration._gmlSuppressFollowingEmptyLine = true;

    if (!insertNodeBefore(root, declaration, clonedDeclaration)) {
        return;
    }

    declaration._gmlManualMathOriginalRecorded = true;
    if (declaration._gmlForceFollowingEmptyLine === true) {
        delete declaration._gmlForceFollowingEmptyLine;
    }
}

function suppressTrailingLineComment( // TODO: This should be moved to where other comment utilities are.
    node,
    targetLine,
    context,
    prefix = "original"
) {
    if (!Number.isFinite(targetLine)) {
        return;
    }

    const candidates = [];

    if (node && typeof node === "object") {
        candidates.push(node);
    }

    if (context && typeof context === "object") {
        const root = context.astRoot;
        if (root && typeof root === "object") {
            candidates.push(root);
        }
    }

    for (const owner of candidates) {
        const comments = Array.isArray(owner?.comments) ? owner.comments : null;
        if (!comments || comments.length === 0) {
            continue;
        }

        for (let index = comments.length - 1; index >= 0; index -= 1) {
            const comment = comments[index];
            if (!comment || comment.type !== "CommentLine") {
                continue;
            }

            const startLine = comment?.start?.line ?? comment?.loc?.start?.line;
            if (startLine !== targetLine) {
                continue;
            }

            const trimmed =
                typeof comment.value === "string"
                    ? comment.value.trim().toLowerCase()
                    : "";
            if (trimmed.length === 0 || trimmed.startsWith(prefix)) {
                comments.splice(index, 1);
            }
        }
    }
}

function removeSimplifiedAliasDeclaration(context, simplifiedNode) {
    if (!context || typeof context !== "object") {
        return;
    }

    const root = context.astRoot;
    if (!root || typeof root !== "object") {
        return;
    }

    const declarator = findVariableDeclaratorForInit(root, simplifiedNode);
    const baseName = getIdentifierName(declarator?.id);

    if (typeof baseName !== "string" || baseName.length === 0) {
        return;
    }

    const aliasName = `${baseName}_simplified`;
    const aliasDeclaration = findVariableDeclarationByName(root, aliasName);

    if (!aliasDeclaration) {
        return;
    }

    const aliasDeclarator = Array.isArray(aliasDeclaration.declarations)
        ? aliasDeclaration.declarations[0]
        : null;

    if (
        !aliasDeclarator ||
        !areNodesEquivalent(aliasDeclarator.init, simplifiedNode)
    ) {
        return;
    }

    const paddedNode = markPreviousSiblingForBlankLine(
        root,
        aliasDeclaration,
        context
    );

    if (!removeNodeFromAst(root, aliasDeclaration)) {
        if (paddedNode && typeof paddedNode === "object") {
            delete paddedNode._gmlForceFollowingEmptyLine;
        }
        return;
    }

    suppressTrailingLineComment(
        simplifiedNode,
        aliasDeclaration?.end?.line,
        context,
        "simplified"
    );
}

function insertNodeBefore(root, target, statement) {
    if (!root || typeof root !== "object" || !target || !statement) {
        return false;
    }

    const stack = [root];
    const visited = new Set();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }

        visited.add(node);

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                const element = node[index];
                if (element === target) {
                    node.splice(index, 0, statement);
                    return true;
                }

                stack.push(element);
            }
            continue;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return false;
}

function markPreviousSiblingForBlankLine(root, target, context) {
    if (!root || typeof root !== "object" || !target) {
        return null;
    }

    const stack = [root];
    const visited = new Set();
    const sourceText = getSourceTextFromContext(context);

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }

        visited.add(node);

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                const element = node[index];

                if (element === target) {
                    const previous = node[index - 1];
                    const next = node[index + 1];

                    if (
                        previous &&
                        typeof previous === "object" &&
                        shouldPreserveRemovedBlankLine(target, next, sourceText)
                    ) {
                        previous._gmlForceFollowingEmptyLine = true;
                        return previous;
                    }

                    return null;
                }

                stack.push(element);
            }
            continue;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return null;
}

function shouldPreserveRemovedBlankLine(removedNode, nextNode, sourceText) {
    if (!nextNode || typeof nextNode !== "object") {
        return false;
    }

    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return false;
    }

    const removedEnd = Core.getNodeEndIndex(removedNode);
    const nextStart = Core.getNodeStartIndex(nextNode);

    if (
        removedEnd == undefined ||
        nextStart == undefined ||
        nextStart <= removedEnd ||
        nextStart > sourceText.length
    ) {
        return false;
    }

    const between = sourceText.slice(removedEnd, nextStart);

    if (between.length === 0) {
        return false;
    }

    const normalizedBetween = between
        .replaceAll("\r", "")
        .replaceAll(/[ \t\f\v]/g, "");

    return normalizedBetween.includes("\n\n");
}

function getSourceTextFromContext(context) {
    if (!context || typeof context !== "object") {
        return null;
    }

    const { originalText, sourceText } = context;

    if (typeof originalText === "string" && originalText.length > 0) {
        return originalText;
    }

    if (typeof sourceText === "string" && sourceText.length > 0) {
        return sourceText;
    }

    return null;
}

function findAssignmentExpressionForRight(root, target) {
    if (!root || typeof root !== "object" || !target) {
        return null;
    }

    const stack = [root];
    const visited = new Set();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }

        visited.add(node);

        if (Array.isArray(node)) {
            for (const element of node) {
                stack.push(element);
            }
            continue;
        }

        if (node.type === "AssignmentExpression" && node.right === target) {
            return node;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return null;
}

function findVariableDeclaratorForInit(root, target) {
    if (!root || typeof root !== "object" || !target) {
        return null;
    }

    const stack = [root];
    const visited = new Set();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }

        visited.add(node);

        if (Array.isArray(node)) {
            for (const element of node) {
                stack.push(element);
            }
            continue;
        }

        if (node.type === "VariableDeclarator" && node.init === target) {
            return node;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return null;
}

function findVariableDeclarationByName(root, identifierName) {
    if (
        !root ||
        typeof root !== "object" ||
        typeof identifierName !== "string"
    ) {
        return null;
    }

    const stack = [root];
    const visited = new Set();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }

        visited.add(node);

        if (Array.isArray(node)) {
            for (const element of node) {
                stack.push(element);
            }
            continue;
        }

        if (
            node.type === "VariableDeclaration" &&
            Array.isArray(node.declarations) &&
            node.declarations.length === 1
        ) {
            const [declarator] = node.declarations;
            const name = getIdentifierName(declarator?.id);

            if (name === identifierName) {
                return node;
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return null;
}

function removeNodeFromAst(root, target) {
    if (!root || typeof root !== "object" || !target) {
        return false;
    }

    const stack = [root];
    const visited = new Set();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }

        visited.add(node);

        if (Array.isArray(node)) {
            for (let index = node.length - 1; index >= 0; index -= 1) {
                const element = node[index];
                if (element === target) {
                    node.splice(index, 1);
                    return true;
                }

                stack.push(element);
            }
            continue;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return false;
}

function normalizeTraversalContext(ast, context) {
    if (context && typeof context === "object") {
        if (context.astRoot && typeof context.astRoot === "object") {
            return context;
        }

        return { ...context, astRoot: ast };
    }

    return { astRoot: ast };
}

function replaceNode(target, replacement) {
    if (!target || typeof target !== "object" || !replacement) {
        return;
    }

    for (const key of Object.keys(target)) {
        delete target[key];
    }

    Object.assign(target, replacement);
}

function hasInlineCommentBetween(left, right, context) {
    // TODO: This should be moved to where other comment utilities are.
    if (!context || typeof context !== "object") {
        return false;
    }

    const sourceText = context.originalText ?? context.sourceText;
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return false;
    }

    const leftEnd = Core.getNodeEndIndex(left);
    const rightStart = Core.getNodeStartIndex(right);

    if (
        leftEnd == undefined ||
        rightStart == undefined ||
        rightStart <= leftEnd ||
        rightStart > sourceText.length
    ) {
        return false;
    }

    const between = sourceText.slice(leftEnd, rightStart);

    if (between.length === 0) {
        return false;
    }

    return (
        between.includes("/*") ||
        between.includes("//") ||
        between.includes("#")
    );
}

function isLnCall(node) {
    const expression = unwrapExpression(node);
    if (
        !expression ||
        expression.type !== CALL_EXPRESSION ||
        getIdentifierName(expression.object) !== "ln"
    ) {
        return false;
    }

    const args = Array.isArray(expression.arguments)
        ? expression.arguments
        : [];

    return args.length === 1;
}

export {
    attemptCancelReciprocalRatios,
    attemptCollectDistributedScalars,
    attemptCondenseNumericChainWithMultipleBases,
    attemptCondenseScalarProduct,
    attemptCondenseSimpleScalarProduct,
    attemptConvertDegreesToRadians,
    attemptRemoveAdditiveIdentity,
    attemptRemoveMultiplicativeIdentity,
    attemptSimplifyDivisionByReciprocal,
    attemptSimplifyNegativeDivisionProduct,
    attemptSimplifyOneMinusFactor,
    normalizeTraversalContext,
    isIdentityReplacementSafeExpression,
    replaceNodeWith
};
