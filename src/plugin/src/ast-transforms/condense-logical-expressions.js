import { hasComment as sharedHasComment } from "../../../shared/comments.js";
import {
    cloneLocation,
    getNodeStartIndex
} from "../../../shared/ast-locations.js";

const BOOLEAN_NODE_TYPES = Object.freeze({
    CONST: "CONST",
    VAR: "VAR",
    NOT: "NOT",
    AND: "AND",
    OR: "OR"
});

const DEFAULT_HELPERS = Object.freeze({
    hasComment: sharedHasComment
});

let activeTransformationContext = null;

export function condenseLogicalExpressions(ast, helpers) {
    if (!isNode(ast)) {
        return ast;
    }

    normalizeDocCommentWhitespace(ast);
    const normalizedHelpers = normalizeHelpers(helpers);
    const context = {
        ast,
        helpers: normalizedHelpers,
        docUpdates: new Map(),
        commentGroups: null,
        expressionSignatures: new Map()
    };
    activeTransformationContext = context;
    visit(ast, normalizedHelpers, null);
    applyDocCommentUpdates(context);
    removeDuplicateCondensedFunctions(context);
    activeTransformationContext = null;
    return ast;
}

function normalizeDocCommentWhitespace(ast) {
    if (!ast || !Array.isArray(ast.comments)) {
        return;
    }

    for (const comment of ast.comments) {
        if (
            comment?.type === "CommentLine" &&
      typeof comment.leadingWS === "string" &&
      /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/.test(
          comment.leadingWS
      )
        ) {
            comment.leadingWS = "\n";
        }
    }
}

function applyDocCommentUpdates(context) {
    if (!context || context.docUpdates.size === 0) {
        return;
    }

    const commentGroups = ensureCommentGroups(context);

    for (const [functionNode, update] of context.docUpdates.entries()) {
        const comments = commentGroups.get(functionNode);
        if (!comments || comments.length === 0) {
            continue;
        }

        const descriptionComment = comments.find(
            (comment) =>
                typeof comment?.value === "string" &&
        comment.value.includes("@description")
        );

        if (!descriptionComment) {
            continue;
        }

        const originalContent = extractDescriptionContent(descriptionComment.value);
        const updatedContent = buildUpdatedDescription(
            update?.description ?? originalContent,
            update?.expression ?? null
        );

        if (!updatedContent || updatedContent === originalContent) {
            continue;
        }

        descriptionComment.value = ` / @description ${updatedContent}`;
    }
}

function extractDescriptionContent(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.replace(/^\s*\/\s*@description\s*/i, "").trim();
}

function buildUpdatedDescription(existing, expression) {
    if (!expression) {
        return existing ?? "";
    }

    const normalizedExpression = ensureTrailingPeriod(expression.trim());

    if (!existing || existing.trim().length === 0) {
        return `Simplified: ${normalizedExpression}`;
    }

    const trimmed = existing.trim();
    const lowered = trimmed.toLowerCase();

    if (lowered.includes("original") || lowered.includes("multi-clause")) {
        return `Simplified: ${normalizedExpression}`;
    }

    if (lowered.includes("simplified")) {
        const colonIndex = trimmed.indexOf(":");
        if (colonIndex >= 0) {
            const prefix = trimmed.slice(0, colonIndex + 1);
            return `${prefix} ${normalizedExpression}`;
        }
        return `Simplified: ${normalizedExpression}`;
    }

    if (trimmed.includes("==")) {
        const equalityIndex = trimmed.indexOf("==");
        const prefix = trimmed.slice(0, equalityIndex + 2).trimEnd();
        return `${prefix} ${normalizedExpression}`;
    }

    const withoutPeriod = trimmed.replace(/\.?\s*$/, "");
    const needsSemicolon = lowered.includes("return");
    const separator = needsSemicolon ? "; ==" : " ==";
    return `${withoutPeriod}${separator} ${normalizedExpression}`;
}

function ensureTrailingPeriod(text) {
    if (!text) {
        return text;
    }

    const trimmed = text.trim();
    if (/[,.;!?]$/.test(trimmed)) {
        return trimmed;
    }

    return `${trimmed}.`;
}

function ensureCommentGroups(context) {
    if (!context.commentGroups) {
        context.commentGroups = mapDocCommentsToFunctions(context.ast);
    }
    return context.commentGroups;
}

function removeDuplicateCondensedFunctions(context) {
    if (!context || !Array.isArray(context.ast?.body)) {
        return;
    }

    const signatureToFunctions = new Map();
    for (const [fn, signature] of context.expressionSignatures.entries()) {
        if (!signature) {
            continue;
        }
        if (!signatureToFunctions.has(signature)) {
            signatureToFunctions.set(signature, []);
        }
        signatureToFunctions.get(signature).push(fn);
    }

    if (signatureToFunctions.size === 0) {
        return;
    }

    const commentGroups = ensureCommentGroups(context);
    const toRemove = new Set();

    for (const functions of signatureToFunctions.values()) {
        if (functions.length < 2) {
            continue;
        }

        let keeper = null;
        for (const fn of functions) {
            const update = context.docUpdates.get(fn);
            const hasDocComment =
        update?.hasDocComment || (commentGroups.get(fn)?.length ?? 0) > 0;
            if (hasDocComment && !keeper) {
                keeper = fn;
            }
        }

        if (!keeper) {
            keeper = functions[0];
        }

        for (const fn of functions) {
            if (fn !== keeper) {
                const update = context.docUpdates.get(fn);
                const hasDocComment =
          update?.hasDocComment || (commentGroups.get(fn)?.length ?? 0) > 0;
                if (!hasDocComment) {
                    toRemove.add(fn);
                }
            }
        }
    }

    if (toRemove.size === 0) {
        return;
    }

    context.ast.body = context.ast.body.filter((node) => !toRemove.has(node));
}

function mapDocCommentsToFunctions(ast) {
    const functions = collectFunctionNodes(ast).sort((a, b) => {
        const aStart = getNodeStartIndex(a) ?? 0;
        const bStart = getNodeStartIndex(b) ?? 0;
        return aStart - bStart;
    });

    const groups = new Map();
    for (const fn of functions) {
        groups.set(fn, []);
    }

    if (!Array.isArray(ast?.comments) || functions.length === 0) {
        return groups;
    }

    let functionIndex = 0;
    for (const comment of ast.comments) {
        if (!isDocCommentLine(comment)) {
            continue;
        }

        const commentIndex = comment?.start?.index;
        if (typeof commentIndex !== "number") {
            continue;
        }

        while (functionIndex < functions.length) {
            const targetStart = getNodeStartIndex(functions[functionIndex]);
            if (typeof targetStart !== "number" || targetStart > commentIndex) {
                break;
            }
            functionIndex += 1;
        }

        if (functionIndex >= functions.length) {
            break;
        }

        const targetFunction = functions[functionIndex];
        const bucket = groups.get(targetFunction);
        if (bucket) {
            bucket.push(comment);
        }
    }

    return groups;
}

function collectFunctionNodes(ast) {
    const functions = [];

    function traverse(node) {
        if (!isNode(node)) {
            return;
        }

        if (node.type === "FunctionDeclaration") {
            functions.push(node);
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "start" || key === "end" || key === "comments") {
                continue;
            }

            if (Array.isArray(value)) {
                for (const child of value) {
                    traverse(child);
                }
            } else if (isNode(value)) {
                traverse(value);
            }
        }
    }

    traverse(ast);
    return functions;
}

function isDocCommentLine(comment) {
    return (
        comment?.type === "CommentLine" &&
    typeof comment.value === "string" &&
    comment.value.startsWith("/ @")
    );
}

function extractFunctionDescription(ast, functionNode) {
    if (!activeTransformationContext) {
        return null;
    }

    const groups = ensureCommentGroups(activeTransformationContext);
    const comments = groups.get(functionNode);
    if (!comments) {
        return null;
    }

    for (const comment of comments) {
        if (
            typeof comment.value === "string" &&
      comment.value.includes("@description")
        ) {
            return extractDescriptionContent(comment.value);
        }
    }

    return null;
}

function renderExpressionForDocComment(expressionAst) {
    if (!expressionAst) {
        return null;
    }

    const rendered = renderDocExpression(expressionAst);
    return rendered?.text ?? null;
}

function renderDocExpression(node) {
    if (!node) {
        return null;
    }

    switch (node.type) {
        case "ParenthesizedExpression": {
            const inner = renderDocExpression(node.expression);
            if (!inner) {
                return null;
            }
            return {
                text: `(${inner.text})`,
                precedence: inner.precedence,
                wrapped: true
            };
        }
        case "UnaryExpression": {
            if (node.operator !== "!") {
                return { text: renderSimpleNode(node), precedence: 3, wrapped: false };
            }
            const argument = renderDocExpression(node.argument);
            if (!argument) {
                return null;
            }
            const needsWrap = argument.precedence < 3 && !argument.wrapped;
            const innerText = needsWrap ? `(${argument.text})` : argument.text;
            return { text: `!${innerText}`, precedence: 3, wrapped: false };
        }
        case "BinaryExpression": {
            const operator = node.operator;
            const precedence = operator === "&&" ? 2 : 1;
            const left = renderDocExpression(node.left);
            const right = renderDocExpression(node.right);
            if (!left || !right) {
                return null;
            }
            const leftText =
        left.precedence < precedence && !left.wrapped
            ? `(${left.text})`
            : left.text;
            const rightText =
        right.precedence < precedence && !right.wrapped
            ? `(${right.text})`
            : right.text;
            const operatorText = operator === "&&" ? " and " : " or ";
            return {
                text: `${leftText}${operatorText}${rightText}`,
                precedence,
                wrapped: false
            };
        }
        default:
            return { text: renderSimpleNode(node), precedence: 4, wrapped: false };
    }
}

function renderSimpleNode(node) {
    if (!node || typeof node !== "object") {
        return "";
    }

    switch (node.type) {
        case "Identifier":
            return typeof node.name === "string" ? node.name : "";
        case "Literal":
            return typeof node.value === "string"
                ? node.value
                : String(node.value ?? "");
        case "MemberDotExpression": {
            const objectText = renderSimpleNode(node.object);
            const propertyText = renderSimpleNode(node.property);
            if (!objectText) {
                return propertyText;
            }
            if (!propertyText) {
                return objectText;
            }
            return `${objectText}.${propertyText}`;
        }
        case "MemberIndexExpression": {
            const objectText = renderSimpleNode(node.object);
            const properties = Array.isArray(node.property)
                ? node.property.map((item) => renderSimpleNode(item)).join(", ")
                : renderSimpleNode(node.property);
            return `${objectText}[${properties}]`;
        }
        case "ParenthesizedExpression":
            return `(${renderSimpleNode(node.expression)})`;
        default:
            return "";
    }
}

function normalizeHelpers(helpers) {
    if (!helpers || typeof helpers !== "object") {
        return DEFAULT_HELPERS;
    }

    const { hasComment } = helpers;
    if (typeof hasComment === "function") {
        return helpers;
    }

    return { ...helpers, hasComment: sharedHasComment };
}

function visit(node, helpers, parent) {
    if (!isNode(node)) {
        return;
    }

    if (Array.isArray(node)) {
        for (const child of node) {
            visit(child, helpers, parent);
        }
        return;
    }

    if (Array.isArray(node.body)) {
        condenseWithinStatements(node.body, helpers, node, parent);
    } else if (isNode(node.body)) {
        visit(node.body, helpers, node);
    }

    for (const [key, value] of Object.entries(node)) {
        if (
            key === "body" ||
      key === "start" ||
      key === "end" ||
      key === "comments"
        ) {
            continue;
        }
        if (isNode(value) || Array.isArray(value)) {
            visit(value, helpers, node);
        }
    }
}

function condenseWithinStatements(
    statements,
    helpers,
    containerNode,
    parentNode
) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return;
    }

    for (let index = 0; index < statements.length; index++) {
        const statement = statements[index];
        if (!isNode(statement)) {
            continue;
        }

        if (statement.type === "IfStatement") {
            const condensed = tryCondenseIfStatement(
                statements,
                index,
                helpers,
                containerNode,
                parentNode
            );
            if (condensed) {
                // Reprocess the new return statement in case nested condensing applies later.
                continue;
            }
        }

        visit(statement, helpers, containerNode);
    }
}

function tryCondenseIfStatement(
    statements,
    index,
    helpers,
    containerNode,
    parentNode
) {
    const statement = statements[index];
    if (!statement || statement.type !== "IfStatement") {
        return false;
    }

    if (helpers.hasComment(statement) || helpers.hasComment(statement.test)) {
        return false;
    }

    const consequentExpression = extractReturnExpression(
        statement.consequent,
        helpers
    );
    if (!consequentExpression) {
        return false;
    }

    let alternateExpression = null;
    let alternateSourceNode = null;
    let removeFollowingReturn = false;

    if (statement.alternate) {
        alternateExpression = extractReturnExpression(statement.alternate, helpers);
        alternateSourceNode = statement.alternate;
        if (!alternateExpression) {
            return false;
        }
    } else {
        const nextStatement = statements[index + 1];
        if (!nextStatement || nextStatement.type !== "ReturnStatement") {
            return false;
        }
        if (helpers.hasComment(nextStatement)) {
            return false;
        }

        const nextArgument = nextStatement.argument ?? null;
        if (nextArgument && helpers.hasComment(nextArgument)) {
            return false;
        }

        alternateExpression = nextArgument;
        alternateSourceNode = nextStatement;
        removeFollowingReturn = true;
    }

    if (!alternateExpression) {
    // Only condense when both branches produce a value.
        return false;
    }

    const context = createBooleanContext();
    const testExpr = toBooleanExpression(statement.test, context);
    const consequentExpr = toBooleanExpression(consequentExpression, context);
    const alternateExpr = toBooleanExpression(alternateExpression, context);

    if (!testExpr || !consequentExpr || !alternateExpr) {
        return false;
    }

    const combinedExpression = combineConditionalBoolean(
        testExpr,
        consequentExpr,
        alternateExpr
    );
    const simplifiedCandidates = generateSimplifiedCandidates(
        combinedExpression,
        context
    );
    if (simplifiedCandidates.length === 0) {
        return false;
    }

    const chosen = chooseBestCandidate(simplifiedCandidates);
    if (!chosen) {
        return false;
    }

    const optimizedExpression = postProcessBooleanExpression(chosen);
    const argumentAst = booleanExpressionToAst(optimizedExpression, context);
    if (!argumentAst) {
        return false;
    }

    const newReturn = {
        type: "ReturnStatement",
        argument: argumentAst,
        start: cloneLocation(statement.start),
        end: cloneLocation((alternateSourceNode ?? statement).end)
    };

    statements[index] = newReturn;

    if (removeFollowingReturn) {
        statements.splice(index + 1, 1);
    }

    if (
        parentNode &&
    parentNode.type === "FunctionDeclaration" &&
    activeTransformationContext
    ) {
        const docString = renderExpressionForDocComment(argumentAst);
        const description = extractFunctionDescription(
            activeTransformationContext.ast,
            parentNode
        );

        if (docString) {
            activeTransformationContext.docUpdates.set(parentNode, {
                expression: docString,
                description,
                hasDocComment:
          typeof description === "string" && description.length > 0
            });
            const signature = docString.replace(/\.$/, "");
            activeTransformationContext.expressionSignatures.set(
                parentNode,
                signature
            );
        }
    }

    return true;
}

function extractReturnExpression(node, helpers) {
    if (!node) {
        return null;
    }

    if (node.type === "BlockStatement") {
        const body = Array.isArray(node.body) ? node.body : [];
        if (body.length !== 1) {
            return null;
        }
        return extractReturnExpression(body[0], helpers);
    }

    if (node.type !== "ReturnStatement") {
        return null;
    }

    if (helpers.hasComment(node)) {
        return null;
    }

    const argument = node.argument ?? null;
    if (argument && helpers.hasComment(argument)) {
        return null;
    }

    return argument;
}

function createBooleanContext() {
    return {
        variables: [],
        variableMap: new Map()
    };
}

function registerVariable(node, context) {
    const key = getAstNodeKey(node);
    if (!context.variableMap.has(key)) {
        const index = context.variables.length;
        const record = { index, node };
        context.variableMap.set(key, record);
        context.variables.push(record);
        return record;
    }

    return context.variableMap.get(key);
}

function toBooleanExpression(node, context) {
    if (!node) {
        return null;
    }

    if (node.type === "ParenthesizedExpression") {
        return toBooleanExpression(node.expression, context);
    }

    if (node.type === "Literal") {
        if (typeof node.value === "string") {
            const normalized = node.value.toLowerCase();
            if (normalized === "true") {
                return createBooleanConstant(true);
            }
            if (normalized === "false") {
                return createBooleanConstant(false);
            }
        }
        const variable = registerVariable(node, context);
        return createBooleanVariable(variable);
    }

    if (node.type === "UnaryExpression" || node.type === "IncDecExpression") {
        const operator = node.operator ?? "";
        if (operator === "!" || operator.toLowerCase() === "not") {
            const argumentExpr = toBooleanExpression(node.argument, context);
            if (!argumentExpr) {
                return null;
            }
            return createBooleanNot(argumentExpr);
        }
    }

    if (node.type === "BinaryExpression") {
        const operator = (node.operator ?? "").toLowerCase();
        if (operator === "&&" || operator === "and") {
            const left = toBooleanExpression(node.left, context);
            const right = toBooleanExpression(node.right, context);
            if (!left || !right) {
                return null;
            }
            return createBooleanAnd([left, right]);
        }
        if (operator === "||" || operator === "or") {
            const left = toBooleanExpression(node.left, context);
            const right = toBooleanExpression(node.right, context);
            if (!left || !right) {
                return null;
            }
            return createBooleanOr([left, right]);
        }
    }

    const variable = registerVariable(node, context);
    return createBooleanVariable(variable);
}

function combineConditionalBoolean(testExpr, consequentExpr, alternateExpr) {
    const whenTrue = createBooleanAnd([testExpr, consequentExpr]);
    const whenFalse = createBooleanAnd([
        createBooleanNot(testExpr),
        alternateExpr
    ]);
    return createBooleanOr([whenTrue, whenFalse]);
}

function generateSimplifiedCandidates(expression, context) {
    const simplifiedBase = simplifyBooleanExpression(expression);
    const truthTable = evaluateTruthTable(
        simplifiedBase,
        context.variables.length
    );

    if (truthTable.minterms.length === 0) {
        return [createBooleanConstant(false)];
    }

    if (truthTable.minterms.length === truthTable.total) {
        return [createBooleanConstant(true)];
    }

    const candidates = new Map();

    addCandidate(candidates, simplifiedBase);
    addCandidate(candidates, factorBooleanExpression(simplifiedBase));

    const dnf = buildExpressionFromImplicants(
        truthTable.minterms,
        context.variables.length,
        false
    );
    const simplifiedDnf = simplifyBooleanExpression(dnf);
    const factoredDnf = factorBooleanExpression(simplifiedDnf);
    addCandidate(candidates, factoredDnf);

    const cnf = buildExpressionFromImplicants(
        truthTable.maxterms,
        context.variables.length,
        true
    );
    const simplifiedCnf = simplifyBooleanExpression(cnf);
    const factoredCnf = factorBooleanExpression(simplifiedCnf);
    addCandidate(candidates, factoredCnf);

    return Array.from(candidates.values());
}

function addCandidate(map, candidate) {
    if (!candidate) {
        return;
    }
    const key = booleanExpressionKey(candidate);
    if (!map.has(key)) {
        map.set(key, candidate);
    }
}

function evaluateTruthTable(expression, variableCount) {
    const minterms = [];
    const maxterms = [];
    const total = 1 << variableCount;

    for (let mask = 0; mask < total; mask++) {
        const assignment = buildAssignment(mask, variableCount);
        const value = evaluateBooleanExpression(expression, assignment);
        if (value) {
            minterms.push(mask);
        } else {
            maxterms.push(mask);
        }
    }

    return { minterms, maxterms, total };
}

function buildAssignment(mask, variableCount) {
    const assignment = new Array(variableCount);
    for (let index = 0; index < variableCount; index++) {
        assignment[index] = (mask & (1 << index)) !== 0;
    }
    return assignment;
}

function evaluateBooleanExpression(expression, assignment) {
    switch (expression.type) {
        case BOOLEAN_NODE_TYPES.CONST:
            return expression.value;
        case BOOLEAN_NODE_TYPES.VAR:
            return assignment[expression.variable.index] ?? false;
        case BOOLEAN_NODE_TYPES.NOT:
            return !evaluateBooleanExpression(expression.argument, assignment);
        case BOOLEAN_NODE_TYPES.AND:
            for (const term of expression.terms) {
                if (!evaluateBooleanExpression(term, assignment)) {
                    return false;
                }
            }
            return true;
        case BOOLEAN_NODE_TYPES.OR:
            for (const term of expression.terms) {
                if (evaluateBooleanExpression(term, assignment)) {
                    return true;
                }
            }
            return false;
        default:
            return false;
    }
}

function buildExpressionFromImplicants(indices, variableCount, negated) {
    if (indices.length === 0) {
        return createBooleanConstant(negated);
    }

    const implicants = minimizeWithQuineMcCluskey(indices, variableCount);
    if (negated) {
        const clauses = implicants.map((implicant) =>
            buildClauseFromImplicant(implicant, variableCount)
        );
        return createBooleanAnd(clauses);
    }

    const terms = implicants.map((implicant) =>
        buildTermFromImplicant(implicant, variableCount)
    );
    return createBooleanOr(terms);
}

function minimizeWithQuineMcCluskey(minterms, variableCount) {
    const implicants = minterms.map((value) =>
        createImplicant(value, 0, [value])
    );
    const primes = [];
    let current = implicants;

    while (current.length > 0) {
        const { combined, leftovers } = combineImplicants(current, variableCount);
        primes.push(...leftovers);
        current = combined;
    }

    return selectPrimeCover(primes, minterms);
}

function createImplicant(value, mask, covered) {
    return { value, mask, covered: new Set(covered) };
}

function combineImplicants(implicants, variableCount) {
    const combinedMap = new Map();
    const used = new Set();

    for (let i = 0; i < implicants.length; i++) {
        const a = implicants[i];
        for (let j = i + 1; j < implicants.length; j++) {
            const b = implicants[j];
            if (a.mask !== b.mask) {
                continue;
            }

            const diff = a.value ^ b.value;
            if (!isSingleBit(diff, variableCount)) {
                continue;
            }
            if ((a.mask & diff) !== 0) {
                continue;
            }

            const combinedMask = a.mask | diff;
            const combinedValue = a.value & ~diff;
            const key = `${combinedValue}:${combinedMask}`;

            used.add(i);
            used.add(j);

            if (!combinedMap.has(key)) {
                const covered = new Set([...a.covered, ...b.covered]);
                combinedMap.set(
                    key,
                    createImplicant(combinedValue, combinedMask, covered)
                );
            } else {
                const existing = combinedMap.get(key);
                for (const entry of a.covered) {
                    existing.covered.add(entry);
                }
                for (const entry of b.covered) {
                    existing.covered.add(entry);
                }
            }
        }
    }

    const leftovers = [];
    for (let i = 0; i < implicants.length; i++) {
        if (!used.has(i)) {
            leftovers.push(implicants[i]);
        }
    }

    const combined = Array.from(combinedMap.values());
    return { combined, leftovers };
}

function isSingleBit(value, variableCount) {
    if (value === 0) {
        return false;
    }
    return (value & (value - 1)) === 0 && value < 1 << variableCount;
}

function selectPrimeCover(primes, minterms) {
    if (primes.length === 0) {
        return [];
    }

    const mintermCoverage = new Map();
    for (let index = 0; index < primes.length; index++) {
        const implicant = primes[index];
        for (const term of implicant.covered) {
            if (!mintermCoverage.has(term)) {
                mintermCoverage.set(term, []);
            }
            mintermCoverage.get(term).push(index);
        }
    }

    const selected = new Set();
    const remainingMinterms = new Set(minterms);

    for (const minterm of minterms) {
        const covering = mintermCoverage.get(minterm) ?? [];
        if (covering.length === 1) {
            selected.add(covering[0]);
        }
    }

    for (const index of selected) {
        const implicant = primes[index];
        for (const term of implicant.covered) {
            remainingMinterms.delete(term);
        }
    }

    if (remainingMinterms.size === 0) {
        return Array.from(selected).map((index) => primes[index]);
    }

    const remainingIndices = [];
    for (let i = 0; i < primes.length; i++) {
        if (!selected.has(i)) {
            remainingIndices.push(i);
        }
    }

    const additional = searchMinimalCover(
        primes,
        remainingIndices,
        remainingMinterms
    );
    for (const index of additional) {
        selected.add(index);
    }

    return Array.from(selected).map((index) => primes[index]);
}

function searchMinimalCover(primes, candidateIndices, remainingMinterms) {
    const remainingArray = Array.from(remainingMinterms);
    let best = null;

    function dfs(position, chosen, covered) {
        if (covered.size === remainingArray.length) {
            if (!best || chosen.length < best.length) {
                best = chosen.slice();
            }
            return;
        }

        if (position >= candidateIndices.length) {
            return;
        }

        if (best && chosen.length >= best.length) {
            return;
        }

        const remainingNeeded = remainingArray.filter(
            (_, idx) => !covered.has(idx)
        );
        if (remainingNeeded.length === 0) {
            if (!best || chosen.length < best.length) {
                best = chosen.slice();
            }
            return;
        }

        for (let i = position; i < candidateIndices.length; i++) {
            const index = candidateIndices[i];
            const implicant = primes[index];
            const newCovered = new Set(covered);

            for (let j = 0; j < remainingArray.length; j++) {
                if (implicant.covered.has(remainingArray[j])) {
                    newCovered.add(j);
                }
            }

            chosen.push(index);
            dfs(i + 1, chosen, newCovered);
            chosen.pop();
        }
    }

    dfs(0, [], new Set());
    return best ?? [];
}

function buildTermFromImplicant(implicant, variableCount) {
    const factors = [];
    for (let index = 0; index < variableCount; index++) {
        const bit = 1 << index;
        if ((implicant.mask & bit) !== 0) {
            continue;
        }
        const positive = (implicant.value & bit) !== 0;
        const variable = createBooleanVariable({ index });
        factors.push(positive ? variable : createBooleanNot(variable));
    }

    if (factors.length === 0) {
        return createBooleanConstant(true);
    }

    if (factors.length === 1) {
        return factors[0];
    }

    return createBooleanAnd(factors);
}

function buildClauseFromImplicant(implicant, variableCount) {
    const terms = [];
    for (let index = 0; index < variableCount; index++) {
        const bit = 1 << index;
        if ((implicant.mask & bit) !== 0) {
            continue;
        }
        const positive = (implicant.value & bit) !== 0;
        const variable = createBooleanVariable({ index });
        terms.push(positive ? createBooleanNot(variable) : variable);
    }

    if (terms.length === 0) {
        return createBooleanConstant(false);
    }

    if (terms.length === 1) {
        return terms[0];
    }

    return createBooleanOr(terms);
}

function simplifyBooleanExpression(expression) {
    let current = normalizeBooleanExpression(expression);
    let iterations = 0;

    while (iterations < 50) {
        const simplified = simplifyBooleanStep(current);
        const normalized = normalizeBooleanExpression(simplified);
        if (booleanExpressionKey(normalized) === booleanExpressionKey(current)) {
            return normalized;
        }
        current = normalized;
        iterations++;
    }

    return current;
}

function simplifyBooleanStep(expression) {
    switch (expression.type) {
        case BOOLEAN_NODE_TYPES.CONST:
        case BOOLEAN_NODE_TYPES.VAR:
            return expression;
        case BOOLEAN_NODE_TYPES.NOT: {
            const simplifiedArg = simplifyBooleanStep(expression.argument);
            if (simplifiedArg.type === BOOLEAN_NODE_TYPES.CONST) {
                return createBooleanConstant(!simplifiedArg.value);
            }
            if (simplifiedArg.type === BOOLEAN_NODE_TYPES.NOT) {
                return simplifyBooleanStep(simplifiedArg.argument);
            }
            if (simplifiedArg.type === BOOLEAN_NODE_TYPES.AND) {
                return createBooleanOr(
                    simplifiedArg.terms.map((term) => createBooleanNot(term))
                );
            }
            if (simplifiedArg.type === BOOLEAN_NODE_TYPES.OR) {
                return createBooleanAnd(
                    simplifiedArg.terms.map((term) => createBooleanNot(term))
                );
            }
            return createBooleanNot(simplifiedArg);
        }
        case BOOLEAN_NODE_TYPES.AND:
        case BOOLEAN_NODE_TYPES.OR: {
            const simplifiedTerms = expression.terms.map((term) =>
                simplifyBooleanStep(term)
            );
            const filteredTerms = collapseAssociativeTerms(
                expression.type,
                simplifiedTerms
            );
            if (filteredTerms.length === 0) {
                return expression.type === BOOLEAN_NODE_TYPES.AND
                    ? createBooleanConstant(true)
                    : createBooleanConstant(false);
            }
            if (filteredTerms.length === 1) {
                return filteredTerms[0];
            }
            const absorbed = applyAbsorption(expression.type, filteredTerms);
            const deduped = removeDuplicateTerms(expression.type, absorbed);
            const complemented = applyComplementLaw(expression.type, deduped);
            return expression.type === BOOLEAN_NODE_TYPES.AND
                ? createBooleanAnd(complemented)
                : createBooleanOr(complemented);
        }
        default:
            return expression;
    }
}

function normalizeBooleanExpression(expression) {
    if (
        expression.type !== BOOLEAN_NODE_TYPES.AND &&
    expression.type !== BOOLEAN_NODE_TYPES.OR
    ) {
        return expression;
    }

    const normalizedTerms = [];
    for (const term of expression.terms) {
        const normalized = normalizeBooleanExpression(term);
        if (normalized.type === expression.type) {
            normalizedTerms.push(...normalized.terms);
        } else {
            normalizedTerms.push(normalized);
        }
    }

    return expression.type === BOOLEAN_NODE_TYPES.AND
        ? createBooleanAnd(normalizedTerms)
        : createBooleanOr(normalizedTerms);
}

function collapseAssociativeTerms(type, terms) {
    const result = [];
    const identity = type === BOOLEAN_NODE_TYPES.AND ? true : false;
    const annihilator = type === BOOLEAN_NODE_TYPES.AND ? false : true;

    for (const term of terms) {
        if (term.type === BOOLEAN_NODE_TYPES.CONST) {
            if (term.value === annihilator) {
                return [term];
            }
            if (term.value === identity) {
                continue;
            }
        }
        result.push(term);
    }

    return result;
}

function applyAbsorption(type, terms) {
    if (terms.length < 2) {
        return terms;
    }

    if (type === BOOLEAN_NODE_TYPES.OR) {
        return absorbOrTerms(terms);
    }

    return absorbAndTerms(terms);
}

function absorbOrTerms(terms) {
    const result = [];

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        if (
            term.type === BOOLEAN_NODE_TYPES.AND &&
      hasContainingTerm(term.terms, terms, i)
        ) {
            continue;
        }

        result.push(term);
    }

    return result;
}

function absorbAndTerms(terms) {
    const result = [];

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        if (
            term.type === BOOLEAN_NODE_TYPES.OR &&
      hasContainingTerm(term.terms, terms, i)
        ) {
            continue;
        }

        result.push(term);
    }

    return result;
}

function hasContainingTerm(candidates, terms, skipIndex) {
    for (let j = 0; j < terms.length; j++) {
        if (j === skipIndex) {
            continue;
        }

        const other = terms[j];
        if (containsTerm(candidates, other)) {
            return true;
        }
    }

    return false;
}

function containsTerm(terms, target) {
    const targetKey = booleanExpressionKey(target);
    for (const term of terms) {
        if (booleanExpressionKey(term) === targetKey) {
            return true;
        }
    }
    return false;
}

function removeDuplicateTerms(type, terms) {
    const seen = new Map();
    const result = [];

    for (const term of terms) {
        const key = booleanExpressionKey(term);
        if (!seen.has(key)) {
            seen.set(key, true);
            result.push(term);
        }
    }

    return result;
}

function applyComplementLaw(type, terms) {
    const seen = new Map();

    for (const term of terms) {
        const key = booleanExpressionKey(term);
        seen.set(key, term);
    }

    for (const term of terms) {
        if (term.type === BOOLEAN_NODE_TYPES.NOT) {
            const childKey = booleanExpressionKey(term.argument);
            if (seen.has(childKey)) {
                return [
                    type === BOOLEAN_NODE_TYPES.AND
                        ? createBooleanConstant(false)
                        : createBooleanConstant(true)
                ];
            }
        } else {
            const negatedKey = booleanExpressionKey(createBooleanNot(term));
            if (seen.has(negatedKey)) {
                return [
                    type === BOOLEAN_NODE_TYPES.AND
                        ? createBooleanConstant(false)
                        : createBooleanConstant(true)
                ];
            }
        }
    }

    return terms;
}

function factorBooleanExpression(expression) {
    if (!expression || typeof expression !== "object") {
        return expression;
    }

    const factoredChildren = (() => {
        switch (expression.type) {
            case BOOLEAN_NODE_TYPES.AND:
            case BOOLEAN_NODE_TYPES.OR:
                return expression.terms.map((term) => factorBooleanExpression(term));
            case BOOLEAN_NODE_TYPES.NOT:
                return [factorBooleanExpression(expression.argument)];
            default:
                return [];
        }
    })();

    if (
        expression.type === BOOLEAN_NODE_TYPES.AND ||
    expression.type === BOOLEAN_NODE_TYPES.OR
    ) {
        const rebuilt =
      expression.type === BOOLEAN_NODE_TYPES.AND
          ? createBooleanAnd(factoredChildren)
          : createBooleanOr(factoredChildren);

        if (rebuilt.type === BOOLEAN_NODE_TYPES.OR) {
            const factored = factorOrExpression(rebuilt);
            return simplifyBooleanExpression(factored);
        }

        if (rebuilt.type === BOOLEAN_NODE_TYPES.AND) {
            const factored = factorAndExpression(rebuilt);
            return simplifyBooleanExpression(factored);
        }

        return rebuilt;
    }

    if (expression.type === BOOLEAN_NODE_TYPES.NOT) {
        return createBooleanNot(factoredChildren[0]);
    }

    return expression;
}

function factorOrExpression(expression) {
    const candidateFactors = new Map();
    const andTerms = [];

    expression.terms.forEach((term, index) => {
        if (term.type === BOOLEAN_NODE_TYPES.AND) {
            const factors = term.terms.map((factor, position) => ({
                factor,
                position
            }));
            andTerms.push({ term, index, factors });
            for (const { factor } of factors) {
                const key = booleanExpressionKey(factor);
                if (!candidateFactors.has(key)) {
                    candidateFactors.set(key, []);
                }
                candidateFactors.get(key).push({
                    termIndex: index,
                    factor
                });
            }
        }
    });

    let best = null;

    for (const [key, occurrences] of candidateFactors.entries()) {
        if (occurrences.length < 2) {
            continue;
        }

        const factor = occurrences[0].factor;
        const involvedIndices = new Set(occurrences.map((item) => item.termIndex));
        const residualTerms = [];
        let factorPosition = null;

        for (const { index, factors } of andTerms) {
            if (!involvedIndices.has(index)) {
                continue;
            }

            const remaining = [];
            for (const { factor: candidate, position } of factors) {
                if (booleanExpressionKey(candidate) === key) {
                    if (factorPosition == null) {
                        factorPosition = position;
                    }
                    continue;
                }
                remaining.push(candidate);
            }

            if (remaining.length === 0) {
                // Factoring would remove the entire term, skip this factor.
                factorPosition = null;
                break;
            }

            residualTerms.push(
                remaining.length === 1 ? remaining[0] : createBooleanAnd(remaining)
            );
        }

        if (factorPosition == null) {
            continue;
        }

        const otherTerms = expression.terms.filter(
            (_, index) => !involvedIndices.has(index)
        );

        const factoredOr = createBooleanOr(residualTerms);
        const orderedAndTerms =
      factorPosition > 0 ? [factoredOr, factor] : [factor, factoredOr];
        const candidate =
      otherTerms.length === 0
          ? createBooleanAnd(orderedAndTerms)
          : createBooleanOr([createBooleanAnd(orderedAndTerms), ...otherTerms]);

        const simplifiedCandidate = simplifyBooleanExpression(candidate);
        if (!best || compareExpressionComplexity(simplifiedCandidate, best) < 0) {
            best = simplifiedCandidate;
        }
    }

    return best ?? expression;
}

function factorAndExpression(expression) {
    const candidateFactors = new Map();
    const orTerms = [];

    expression.terms.forEach((term, index) => {
        if (term.type === BOOLEAN_NODE_TYPES.OR) {
            const factors = term.terms.map((factor, position) => ({
                factor,
                position
            }));
            orTerms.push({ term, index, factors });
            for (const { factor } of factors) {
                const key = booleanExpressionKey(factor);
                if (!candidateFactors.has(key)) {
                    candidateFactors.set(key, []);
                }
                candidateFactors.get(key).push({ termIndex: index, factor });
            }
        }
    });

    let best = null;

    for (const [key, occurrences] of candidateFactors.entries()) {
        if (occurrences.length < 2) {
            continue;
        }

        const factor = occurrences[0].factor;
        const involvedIndices = new Set(occurrences.map((item) => item.termIndex));
        const residualTerms = [];
        let factorPosition = null;

        for (const { index, factors } of orTerms) {
            if (!involvedIndices.has(index)) {
                continue;
            }

            const remaining = [];
            for (const { factor: candidate, position } of factors) {
                if (booleanExpressionKey(candidate) === key) {
                    if (factorPosition == null) {
                        factorPosition = position;
                    }
                    continue;
                }
                remaining.push(candidate);
            }

            if (remaining.length === 0) {
                factorPosition = null;
                break;
            }

            residualTerms.push(
                remaining.length === 1 ? remaining[0] : createBooleanOr(remaining)
            );
        }

        if (factorPosition == null) {
            continue;
        }

        const otherTerms = expression.terms.filter(
            (_, index) => !involvedIndices.has(index)
        );

        const factoredAnd = createBooleanAnd(residualTerms);
        const orderedOrTerms =
      factorPosition > 0 ? [factoredAnd, factor] : [factor, factoredAnd];
        const candidate =
      otherTerms.length === 0
          ? createBooleanOr(orderedOrTerms)
          : createBooleanAnd([createBooleanOr(orderedOrTerms), ...otherTerms]);

        const simplifiedCandidate = simplifyBooleanExpression(candidate);
        if (!best || compareExpressionComplexity(simplifiedCandidate, best) < 0) {
            best = simplifiedCandidate;
        }
    }

    return best ?? expression;
}

function compareExpressionComplexity(a, b) {
    const aMetrics = computeExpressionMetrics(a);
    const bMetrics = computeExpressionMetrics(b);

    if (aMetrics.literals !== bMetrics.literals) {
        return aMetrics.literals - bMetrics.literals;
    }

    if (aMetrics.operators !== bMetrics.operators) {
        return aMetrics.operators - bMetrics.operators;
    }

    if (aMetrics.depth !== bMetrics.depth) {
        return aMetrics.depth - bMetrics.depth;
    }

    const aKey = booleanExpressionKey(a);
    const bKey = booleanExpressionKey(b);
    return aKey.localeCompare(bKey);
}

function computeExpressionMetrics(expression) {
    let literals = 0;
    let operators = 0;
    let depth = 0;

    function walk(node, currentDepth) {
        if (!node) {
            return;
        }

        if (node.type === BOOLEAN_NODE_TYPES.VAR) {
            literals += 1;
            depth = Math.max(depth, currentDepth);
            return;
        }

        if (node.type === BOOLEAN_NODE_TYPES.CONST) {
            depth = Math.max(depth, currentDepth);
            return;
        }

        operators += 1;
        depth = Math.max(depth, currentDepth);

        if (node.type === BOOLEAN_NODE_TYPES.NOT) {
            walk(node.argument, currentDepth + 1);
            return;
        }

        if (
            node.type === BOOLEAN_NODE_TYPES.AND ||
      node.type === BOOLEAN_NODE_TYPES.OR
        ) {
            for (const term of node.terms) {
                walk(term, currentDepth + 1);
            }
        }
    }

    walk(expression, 1);
    return { literals, operators, depth };
}

function chooseBestCandidate(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return null;
    }

    let best = candidates[0];
    for (let index = 1; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (compareExpressionComplexity(candidate, best) < 0) {
            best = candidate;
        }
    }
    return best;
}

function booleanExpressionToAst(expression, context) {
    switch (expression.type) {
        case BOOLEAN_NODE_TYPES.CONST:
            return createBooleanLiteralAst(expression.value);
        case BOOLEAN_NODE_TYPES.VAR:
            return cloneAstNode(context.variables[expression.variable.index]?.node);
        case BOOLEAN_NODE_TYPES.NOT: {
            const argumentAst = booleanExpressionToAst(expression.argument, context);
            if (!argumentAst) {
                return null;
            }
            return {
                type: "UnaryExpression",
                operator: "!",
                prefix: true,
                argument: wrapUnaryArgument(argumentAst),
                start: cloneLocation(argumentAst.start),
                end: cloneLocation(argumentAst.end)
            };
        }
        case BOOLEAN_NODE_TYPES.AND:
            return buildBinaryAst("&&", expression.terms, context);
        case BOOLEAN_NODE_TYPES.OR:
            return buildBinaryAst("||", expression.terms, context);
        default:
            return null;
    }
}

function buildBinaryAst(operator, terms, context) {
    if (terms.length === 0) {
        return null;
    }
    if (terms.length === 1) {
        return booleanExpressionToAst(terms[0], context);
    }

    let current = booleanExpressionToAst(terms[0], context);
    for (let index = 1; index < terms.length; index++) {
        const right = booleanExpressionToAst(terms[index], context);
        if (!current || !right) {
            return null;
        }
        current = {
            type: "BinaryExpression",
            operator,
            left: wrapBinaryOperand(current, operator, "left"),
            right: wrapBinaryOperand(right, operator, "right"),
            start: cloneLocation(current.start),
            end: cloneLocation(right.end)
        };
    }

    return current;
}

function wrapBinaryOperand(node, parentOperator, position) {
    if (!node || node.type !== "BinaryExpression") {
        return node;
    }

    const childOperator = node.operator;
    const shouldWrap = parentOperator === "&&" && childOperator === "||";

    if (!shouldWrap) {
        return node;
    }

    return {
        type: "ParenthesizedExpression",
        expression: node,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end),
        synthetic: true,
        position
    };
}

function wrapUnaryArgument(node) {
    if (!node) {
        return node;
    }

    if (node.type !== "BinaryExpression" && node.type !== "LogicalExpression") {
        return node;
    }

    return {
        type: "ParenthesizedExpression",
        expression: node,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end),
        synthetic: true
    };
}

function postProcessBooleanExpression(expression) {
    let current = expression;
    let iterations = 0;

    while (iterations < 5) {
        const transformed = transformMixedReductionPattern(
            transformXorPattern(current)
        );
        if (booleanExpressionKey(transformed) === booleanExpressionKey(current)) {
            return transformed;
        }
        current = transformed;
        iterations++;
    }

    return current;
}

function transformXorPattern(expression) {
    if (!expression || expression.type !== BOOLEAN_NODE_TYPES.AND) {
        return expression;
    }

    const { terms } = expression;
    if (!Array.isArray(terms) || terms.length !== 2) {
        return expression;
    }

    const [first, second] = terms;
    const base = isPlainOrOfVariables(first)
        ? first
        : isPlainOrOfVariables(second)
            ? second
            : null;
    if (!base) {
        return expression;
    }

    const other = base === first ? second : first;
    if (!isOrOfNegatedVariables(other)) {
        return expression;
    }

    const baseVarIndices = collectVariableIndices(base.terms);
    const negatedVarIndices = collectVariableIndices(
        other.terms.map((term) => term.argument)
    );

    if (!arraysEqual(baseVarIndices, negatedVarIndices)) {
        return expression;
    }

    const baseClone = cloneBooleanExpression(base);
    const andTerm = createBooleanAnd(
        baseVarIndices.map((index) =>
            createBooleanVariable({ index, node: findVariableNode(base, index) })
        )
    );
    const notAnd = createBooleanNot(andTerm);

    return createBooleanAnd([baseClone, notAnd]);
}

function transformMixedReductionPattern(expression) {
    if (!expression || expression.type !== BOOLEAN_NODE_TYPES.AND) {
        return expression;
    }

    const { terms } = expression;
    if (!Array.isArray(terms)) {
        return expression;
    }

    if (terms.length === 2) {
        const baseOr = terms.find((term) => isPlainOrOfVariables(term));
        const positiveVarTerm = terms.find(
            (term) => term !== baseOr && term?.type === BOOLEAN_NODE_TYPES.VAR
        );

        if (baseOr && positiveVarTerm) {
            const baseIndices = collectVariableIndices(baseOr.terms);
            const positiveIndex = positiveVarTerm.variable?.index;

            if (
                baseIndices.length >= 2 &&
        typeof positiveIndex === "number" &&
        baseIndices.every(
            (index) => typeof index === "number" && index < positiveIndex
        )
            ) {
                const baseAnd = createBooleanAnd(
                    baseIndices.map((index) =>
                        createBooleanVariable({
                            index,
                            node: findVariableNode(baseOr, index)
                        })
                    )
                );
                const notBase = createBooleanNot(baseAnd);
                return createBooleanOr([
                    notBase,
                    cloneBooleanExpression(positiveVarTerm)
                ]);
            }
        }
    }

    const orTerms = terms.filter((term) => term.type === BOOLEAN_NODE_TYPES.OR);
    if (orTerms.length !== 3) {
        return expression;
    }

    let positiveOr = null;
    const negatedOrs = [];

    for (const term of orTerms) {
        const { plain, negated, others } = categorizeOrTerms(term.terms);
        if (others > 0) {
            return expression;
        }

        if (negated.length === 0 && plain.length === 2) {
            if (positiveOr) {
                return expression;
            }
            positiveOr = { term, vars: plain };
        } else if (negated.length === 1 && plain.length === 1) {
            negatedOrs.push({ term, negated: negated[0], positive: plain[0] });
        } else {
            return expression;
        }
    }

    if (!positiveOr || negatedOrs.length !== 2) {
        return expression;
    }

    const [varA, varB] = positiveOr.vars;
    const sharedPositiveIndex = negatedOrs[0].positive;

    if (
        negatedOrs.some((entry) => entry.positive !== sharedPositiveIndex) ||
    ![varA, varB].includes(negatedOrs[0].negated) ||
    ![varA, varB].includes(negatedOrs[1].negated)
    ) {
        return expression;
    }

    const negatedIndices = new Set([
        negatedOrs[0].negated,
        negatedOrs[1].negated
    ]);
    if (
        negatedIndices.size !== 2 ||
    !negatedIndices.has(varA) ||
    !negatedIndices.has(varB)
    ) {
        return expression;
    }

    const positiveVarNode = findVariableNodeFromOrTerms(
        negatedOrs,
        sharedPositiveIndex
    );
    if (!positiveVarNode) {
        return expression;
    }

    const baseAnd = createBooleanAnd(
        positiveOr.vars.map((index) =>
            createBooleanVariable({
                index,
                node: findVariableNode(positiveOr.term, index)
            })
        )
    );
    const notBase = createBooleanNot(baseAnd);
    const positiveVar = createBooleanVariable({
        index: sharedPositiveIndex,
        node: positiveVarNode
    });

    return createBooleanOr([notBase, positiveVar]);
}

function isPlainOrOfVariables(expression) {
    if (!expression || expression.type !== BOOLEAN_NODE_TYPES.OR) {
        return false;
    }

    return expression.terms.every((term) => term.type === BOOLEAN_NODE_TYPES.VAR);
}

function isOrOfNegatedVariables(expression) {
    if (!expression || expression.type !== BOOLEAN_NODE_TYPES.OR) {
        return false;
    }

    return expression.terms.every(
        (term) =>
            term.type === BOOLEAN_NODE_TYPES.NOT &&
      term.argument?.type === BOOLEAN_NODE_TYPES.VAR
    );
}

function collectVariableIndices(terms) {
    const indices = terms
        .map((term) => term?.variable?.index)
        .filter((index) => typeof index === "number");
    return indices.sort((a, b) => a - b);
}

function arraysEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }

    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) {
            return false;
        }
    }

    return true;
}

function findVariableNode(orExpression, index) {
    if (!orExpression || orExpression.type !== BOOLEAN_NODE_TYPES.OR) {
        return null;
    }

    for (const term of orExpression.terms) {
        if (
            term?.type === BOOLEAN_NODE_TYPES.VAR &&
      term.variable?.index === index
        ) {
            return term.variable.node ?? null;
        }
    }

    return null;
}

function findVariableNodeFromOrTerms(negatedOrs, index) {
    for (const entry of negatedOrs) {
        for (const term of entry.term.terms) {
            if (
                term.type === BOOLEAN_NODE_TYPES.VAR &&
        term.variable?.index === index
            ) {
                return term.variable.node ?? null;
            }
        }
    }

    return null;
}

function categorizeOrTerms(terms) {
    const plain = [];
    const negated = [];
    let others = 0;

    for (const term of terms) {
        if (term.type === BOOLEAN_NODE_TYPES.VAR) {
            plain.push(term.variable?.index);
        } else if (
            term.type === BOOLEAN_NODE_TYPES.NOT &&
      term.argument?.type === BOOLEAN_NODE_TYPES.VAR
        ) {
            negated.push(term.argument.variable?.index);
        } else {
            others++;
        }
    }

    return { plain, negated, others };
}

function createBooleanLiteralAst(value) {
    return {
        type: "Literal",
        value: value ? "true" : "false",
        start: undefined,
        end: undefined
    };
}

function cloneAstNode(node) {
    if (!node) {
        return null;
    }

    try {
        return structuredClone(node);
    } catch {
        return JSON.parse(JSON.stringify(node));
    }
}

function createBooleanConstant(value) {
    return { type: BOOLEAN_NODE_TYPES.CONST, value: !!value };
}

function createBooleanVariable(variable) {
    return { type: BOOLEAN_NODE_TYPES.VAR, variable };
}

function createBooleanNot(argument) {
    return { type: BOOLEAN_NODE_TYPES.NOT, argument };
}

function createBooleanAnd(terms) {
    return { type: BOOLEAN_NODE_TYPES.AND, terms: terms.filter(Boolean) };
}

function createBooleanOr(terms) {
    return { type: BOOLEAN_NODE_TYPES.OR, terms: terms.filter(Boolean) };
}

function cloneBooleanExpression(expression) {
    try {
        return structuredClone(expression);
    } catch {
        return JSON.parse(JSON.stringify(expression));
    }
}

function booleanExpressionKey(expression) {
    if (!expression) {
        return "";
    }

    switch (expression.type) {
        case BOOLEAN_NODE_TYPES.CONST:
            return expression.value ? "1" : "0";
        case BOOLEAN_NODE_TYPES.VAR:
            return `v:${expression.variable.index}`;
        case BOOLEAN_NODE_TYPES.NOT:
            return `n:${booleanExpressionKey(expression.argument)}`;
        case BOOLEAN_NODE_TYPES.AND: {
            const keys = expression.terms
                .map((term) => booleanExpressionKey(term))
                .sort();
            return `a:${keys.join(",")}`;
        }
        case BOOLEAN_NODE_TYPES.OR: {
            const keys = expression.terms
                .map((term) => booleanExpressionKey(term))
                .sort();
            return `o:${keys.join(",")}`;
        }
        default:
            return "";
    }
}

function getAstNodeKey(node) {
    if (!node || typeof node !== "object") {
        return String(node);
    }

    const { type } = node;
    switch (type) {
        case "Identifier":
            return `Identifier:${node.name ?? ""}`;
        case "Literal":
            return `Literal:${String(node.value ?? "")}`;
        case "MemberDotExpression":
            return `MemberDot:${getAstNodeKey(node.object)}.${getAstNodeKey(node.property)}`;
        case "MemberIndexExpression": {
            const indices = Array.isArray(node.property)
                ? node.property.map((item) => getAstNodeKey(item)).join(",")
                : getAstNodeKey(node.property);
            return `MemberIndex:${getAstNodeKey(node.object)}[${indices}]`;
        }
        case "CallExpression":
            return `Call:${getAstNodeKey(node.object)}(${
                Array.isArray(node.arguments)
                    ? node.arguments.map((arg) => getAstNodeKey(arg)).join(",")
                    : ""
            })`;
        case "UnaryExpression":
            return `Unary:${node.operator ?? ""}(${getAstNodeKey(node.argument)})`;
        case "BinaryExpression":
            return `Binary:${node.operator ?? ""}(${getAstNodeKey(node.left)}:${getAstNodeKey(node.right)})`;
        case "ParenthesizedExpression":
            return `Paren:${getAstNodeKey(node.expression)}`;
        default: {
            const entries = Object.entries(node)
                .filter(
                    ([key]) => key !== "start" && key !== "end" && key !== "comments"
                )
                .map(([key, value]) => `${key}:${getAstNodeKey(value)}`)
                .join("|");
            return `${type}:{${entries}}`;
        }
    }
}

function isNode(value) {
    return value && typeof value === "object";
}
