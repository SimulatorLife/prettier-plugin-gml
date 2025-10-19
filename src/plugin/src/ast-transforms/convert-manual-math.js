import { normalizeHasCommentHelpers } from "../comments/index.js";
import {
    cloneLocation,
    getNodeEndIndex,
    getNodeStartIndex
} from "../../../shared/ast-locations.js";
import { getCallExpressionArguments } from "../../../shared/ast-node-helpers.js";

const DEFAULT_HELPERS = Object.freeze(normalizeHasCommentHelpers());

const BINARY_EXPRESSION = "BinaryExpression";
const CALL_EXPRESSION = "CallExpression";
const IDENTIFIER = "Identifier";
const LITERAL = "Literal";
const MEMBER_DOT_EXPRESSION = "MemberDotExpression";
const MEMBER_INDEX_EXPRESSION = "MemberIndexExpression";
const PARENTHESIZED_EXPRESSION = "ParenthesizedExpression";
const UNARY_EXPRESSION = "UnaryExpression";

/**
 * Convert bespoke math expressions into their builtin GML equivalents.
 *
 * The transformer recognises a curated set of safe patterns such as repeated
 * multiplications, squared distance calculations, manual trigonometry
 * conversions, and logarithm identities. Each match rewrites the AST in place
 * so the printer emits the builtin helper instead of the verbose expression.
 *
 * @param {unknown} ast - Parsed AST to rewrite in place.
 * @param {{ hasComment?: (node: unknown) => boolean }} helpers - Optional
 *     helper overrides for comment detection.
 * @param {{ sourceText?: string, originalText?: string } | null} context
 *     Additional source context used to detect inline comments between nodes.
 */
export function convertManualMathExpressions(
    ast,
    helpers = DEFAULT_HELPERS,
    context = null
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const normalizedHelpers = normalizeHasCommentHelpers(helpers);

    traverse(ast, normalizedHelpers, new Set(), context);

    return ast;
}

function traverse(node, helpers, seen, context) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (seen.has(node)) {
        return;
    }

    seen.add(node);

    if (Array.isArray(node)) {
        for (const element of node) {
            traverse(element, helpers, seen, context);
        }
        return;
    }

    let changed = true;
    while (changed) {
        changed = false;

        if (node.type === BINARY_EXPRESSION) {
            if (attemptConvertRepeatedPower(node, helpers)) {
                changed = true;
                continue;
            }

            if (attemptConvertSquare(node, helpers, context)) {
                changed = true;
                continue;
            }

            if (attemptConvertMean(node, helpers)) {
                changed = true;
                continue;
            }

            if (attemptConvertLog2(node, helpers)) {
                changed = true;
                continue;
            }

            if (attemptConvertLengthDir(node, helpers)) {
                changed = true;
                continue;
            }

            if (attemptConvertDotProducts(node, helpers)) {
                changed = true;
                continue;
            }
        }

        if (node.type === CALL_EXPRESSION) {
            if (attemptConvertPointDistanceCall(node, helpers)) {
                changed = true;
                continue;
            }

            if (attemptConvertPowerToSqrt(node, helpers)) {
                changed = true;
                continue;
            }

            if (attemptConvertPowerToExp(node, helpers)) {
                changed = true;
                continue;
            }

            if (attemptConvertPointDirection(node, helpers)) {
                changed = true;
                continue;
            }

            if (attemptConvertTrigDegreeArguments(node, helpers)) {
                changed = true;
                continue;
            }
        }
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === "parent" || !value || typeof value !== "object") {
            continue;
        }

        traverse(value, helpers, seen, context);
    }
}

function attemptConvertSquare(node, helpers, context) {
    if (!isBinaryOperator(node, "*") || helpers.hasComment(node)) {
        return false;
    }

    const rawLeft = node.left;
    const rawRight = node.right;

    if (!rawLeft || !rawRight) {
        return false;
    }

    if (helpers.hasComment(rawLeft) || helpers.hasComment(rawRight)) {
        return false;
    }

    const left = unwrapExpression(rawLeft);
    const right = unwrapExpression(rawRight);

    if (!left || !right) {
        return false;
    }

    if (helpers.hasComment(left) || helpers.hasComment(right)) {
        return false;
    }

    if (hasInlineCommentBetween(rawLeft, rawRight, context)) {
        return false;
    }

    if (!areNodesEquivalent(left, right)) {
        return false;
    }

    if (!isSafeOperand(left)) {
        return false;
    }

    mutateToCallExpression(node, "sqr", [cloneNode(left)], node);
    return true;
}

function attemptConvertRepeatedPower(node, helpers) {
    if (!isBinaryOperator(node, "*") || helpers.hasComment(node)) {
        return false;
    }

    const factors = [];
    if (!collectProductOperands(node, factors, helpers)) {
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
        [cloneNode(base), exponentLiteral],
        node
    );
    return true;
}

function attemptConvertMean(node, helpers) {
    if (helpers.hasComment(node)) {
        return false;
    }

    const expression = unwrapExpression(node);

    if (!expression || expression.type !== BINARY_EXPRESSION) {
        return false;
    }

    let addition = null;
    let divisor = null;

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

    if (helpers.hasComment(addition)) {
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
        [cloneNode(leftTerm), cloneNode(rightTerm)],
        node
    );
    return true;
}

function attemptConvertLog2(node, helpers) {
    if (!isBinaryOperator(node, "/") || helpers.hasComment(node)) {
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

    mutateToCallExpression(node, "log2", [cloneNode(numeratorArg)], node);
    return true;
}

function attemptConvertLengthDir(node, helpers) {
    if (!isBinaryOperator(node, "*") || helpers.hasComment(node)) {
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
                [cloneNode(lengthNode), cloneNode(trigInfo.argument)],
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
                [cloneNode(lengthNode), cloneNode(trigInfo.argument)],
                node
            );
            return true;
        }
    }

    return false;
}

function attemptConvertDotProducts(node, helpers) {
    if (!isBinaryOperator(node, "+") || helpers.hasComment(node)) {
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

        if (!isBinaryOperator(expr, "*") || helpers.hasComment(expr)) {
            return false;
        }

        const left = unwrapExpression(expr.left);
        const right = unwrapExpression(expr.right);

        if (!left || !right) {
            return false;
        }

        leftVector.push(cloneNode(left));
        rightVector.push(cloneNode(right));
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

function attemptConvertPointDistanceCall(node, helpers) {
    if (helpers.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    const callArguments = getCallExpressionArguments(node);

    let distanceExpression = null;
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

    const match = matchSquaredDifferences(distanceExpression, helpers);
    if (!match) {
        return false;
    }

    const args = [];
    for (const difference of match) {
        args.push(cloneNode(difference.subtrahend));
    }
    for (const difference of match) {
        args.push(cloneNode(difference.minuend));
    }

    const functionName =
        match.length === 2 ? "point_distance" : "point_distance_3d";

    mutateToCallExpression(node, functionName, args, node);
    return true;
}

function attemptConvertPowerToSqrt(node, helpers) {
    if (helpers.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    if (calleeName !== "power") {
        return false;
    }

    const args = getCallExpressionArguments(node);
    if (args.length !== 2) {
        return false;
    }

    const exponent = unwrapExpression(args[1]);
    if (!isHalfExponentLiteral(exponent)) {
        return false;
    }

    mutateToCallExpression(node, "sqrt", [cloneNode(args[0])], node);
    return true;
}

function attemptConvertPowerToExp(node, helpers) {
    if (helpers.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    if (calleeName !== "power") {
        return false;
    }

    const args = getCallExpressionArguments(node);
    if (args.length !== 2) {
        return false;
    }

    const base = unwrapExpression(args[0]);
    const exponent = args[1];

    if (!isEulerLiteral(base)) {
        return false;
    }

    mutateToCallExpression(node, "exp", [cloneNode(exponent)], node);
    return true;
}

function attemptConvertPointDirection(node, helpers) {
    if (helpers.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    if (calleeName !== "arctan2") {
        return false;
    }

    const args = getCallExpressionArguments(node);
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
            cloneNode(dxDiff.subtrahend),
            cloneNode(dyDiff.subtrahend),
            cloneNode(dxDiff.minuend),
            cloneNode(dyDiff.minuend)
        ],
        node
    );
    return true;
}

function attemptConvertTrigDegreeArguments(node, helpers) {
    if (helpers.hasComment(node)) {
        return false;
    }

    const calleeName = getIdentifierName(node.object);
    if (calleeName !== "sin" && calleeName !== "cos") {
        return false;
    }

    const args = getCallExpressionArguments(node);
    if (args.length !== 1) {
        return false;
    }

    const argument = args[0];
    const angle = matchDegreesToRadians(argument);

    if (!angle) {
        return false;
    }

    node.arguments = [
        createCallExpressionNode("degtorad", [cloneNode(angle)], argument)
    ];

    return true;
}

function matchSquaredDifferences(expression, helpers) {
    const terms = [];
    collectAdditionTerms(expression, terms);

    if (terms.length < 2 || terms.length > 3) {
        return null;
    }

    const differences = [];

    for (const term of terms) {
        const product = unwrapExpression(term);
        if (!isBinaryOperator(product, "*") || helpers.hasComment(product)) {
            return null;
        }

        const left = unwrapExpression(product.left);
        const right = unwrapExpression(product.right);

        if (!left || !right || !areNodesEquivalent(left, right)) {
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

function collectProductOperands(node, output, helpers) {
    const expression = unwrapExpression(node);
    if (!expression) {
        return false;
    }

    if (!isBinaryOperator(expression, "*")) {
        output.push(expression);
        return true;
    }

    if (helpers.hasComment(expression)) {
        return false;
    }

    return (
        collectProductOperands(expression.left, output, helpers) &&
        collectProductOperands(expression.right, output, helpers)
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

function isBinaryOperator(node, operator) {
    return (
        node &&
        node.type === BINARY_EXPRESSION &&
        typeof node.operator === "string" &&
        node.operator.toLowerCase() === operator
    );
}

function computeNumericTolerance(expected, providedTolerance) {
    if (typeof providedTolerance === "number") {
        return providedTolerance;
    }

    const magnitude = Math.max(1, Math.abs(expected));
    return Number.EPSILON * magnitude * 4;
}

function isLiteralNumber(node, expected, tolerance) {
    const value = parseNumericLiteral(node);
    if (value == undefined) {
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

function isPiIdentifier(node) {
    const expression = unwrapExpression(node);
    return (
        expression &&
        expression.type === IDENTIFIER &&
        typeof expression.name === "string" &&
        expression.name.toLowerCase() === "pi"
    );
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

    for (const key of Object.keys(target)) {
        delete target[key];
    }

    Object.assign(target, call);
}

function createCallExpressionNode(name, args, template) {
    const identifier = createIdentifier(name, template);
    if (!identifier) {
        return null;
    }

    const call = {
        type: CALL_EXPRESSION,
        object: identifier,
        arguments: Array.isArray(args) ? args : []
    };

    if (template && typeof template === "object") {
        if (Object.hasOwn(template, "start")) {
            call.start = cloneLocation(template.start);
        }
        if (Object.hasOwn(template, "end")) {
            call.end = cloneLocation(template.end);
        }
    }

    return call;
}

function createIdentifier(name, template) {
    if (typeof name !== "string" || name.length === 0) {
        return null;
    }

    const identifier = {
        type: IDENTIFIER,
        name
    };

    if (template && typeof template === "object") {
        if (Object.hasOwn(template, "start")) {
            identifier.start = cloneLocation(template.start);
        }

        if (Object.hasOwn(template, "end")) {
            identifier.end = cloneLocation(template.end);
        }
    }

    return identifier;
}

function createNumericLiteral(value, template) {
    const literal = {
        type: LITERAL,
        value: String(value)
    };

    if (template && typeof template === "object") {
        if (Object.hasOwn(template, "start")) {
            literal.start = cloneLocation(template.start);
        }
        if (Object.hasOwn(template, "end")) {
            literal.end = cloneLocation(template.end);
        }
    }

    return literal;
}

function cloneNode(node) {
    return node ? structuredClone(node) : null;
}

function hasInlineCommentBetween(left, right, context) {
    if (!context || typeof context !== "object") {
        return false;
    }

    const sourceText = context.originalText ?? context.sourceText;
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return false;
    }

    const leftEnd = getNodeEndIndex(left);
    const rightStart = getNodeStartIndex(right);

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
