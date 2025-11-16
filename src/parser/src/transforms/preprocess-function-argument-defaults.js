import { Core } from "@gml-modules/core";
import {
    hasComment as sharedHasComment,
    getHasCommentHelper,
    prepareDocCommentEnvironment
} from "../comments/index.js";

const {
    getSingleVariableDeclarator: sharedGetSingleVariableDeclarator,
    getIdentifierText: sharedGetIdentifierText,
    isUndefinedSentinel: sharedIsUndefinedSentinel,
    getSingleMemberIndexPropertyEntry: sharedGetSingleMemberIndexPropertyEntry,
    unwrapParenthesizedExpression,
    getBodyStatements,
    toMutableArray,
    isObjectLike,
    forEachNodeChild,
    getNodeEndIndex,
    getNodeStartIndex,
    assignClonedLocation,
    resolveHelperOverride
} = Core;

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

        // Replace the bare identifier parameter with an explicit
        // DefaultParameter node so downstream consumers (printer,
        // doc generators) can rely on a single canonical shape for
        // defaulted parameters.
        const defaultParamNode = {
            type: "DefaultParameter",
            left: currentParam,
            right: match.fallbackExpression,
            // When the parser detected a fallbackExpression from an
            // argument_count guard, that indicates the parameter was
            // intended as optional by the parser/transforms. Preserve
            // that intent so downstream consumers print accordingly.
            _featherOptionalParameter: true
        };

        node.params[paramInfo.index] = defaultParamNode;
    }

    // When we've converted an in-body argument_count fallback into a
    // DefaultParameter, remove the original guard statement so the
    // function body no longer contains the redundant assignment/if.
    // This mirrors the behavior already applied for the var+if
    // condensation earlier and keeps the AST canonical.
    for (const match of matches) {
        if (!match || !match.statementNode) {
            continue;
        }

        statementsToRemove.add(match.statementNode);
        appliedChanges = true;
        body._gmlForceInitialBlankLine = true;
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
        // Materialize identifier parameters that come after (to the right of)
        // any explicit DefaultParameter. Scan left-to-right and remember when
        // we've encountered a default so subsequent identifiers can be
        // converted into DefaultParameter nodes with an `undefined` right.
        let seenDefaultToLeft = false;
        for (let i = 0; i < params.length; i += 1) {
            const param = params[i];
            if (!param) {
                continue;
            }

            // If a prior transform already produced a DefaultParameter node
            // but left the `right` slot null, materialize it as `undefined`
            // and mark it as feather-optional. That counts as a default for
            // subsequent identifiers to the right.
            // Also treat AssignmentPattern (e.g. `x = 1`) as an explicit
            // default to the left so that trailing identifiers are
            // materialized as optional as expected by the plugin tests.
            if (param.type === "DefaultParameter") {
                if (param.right == null) {
                    // Materialize a missing right-hand side as an `undefined`
                    // identifier. This is a synthetic placeholder and should
                    // NOT be treated as an authoritative parser-intent
                    // optional marker. Only parameters that were explicitly
                    // intended as optional by the parser/transforms should
                    // carry `_featherOptionalParameter = true`.
                    param.right = { type: "Identifier", name: "undefined" };
                    try {
                        // Materialized missing RHS is a synthetic placeholder
                        // and should NOT be treated as an authoritative
                        // parser-intent optional marker. Leave the flag
                        // unset or false so downstream printers omit
                        // optional syntax unless the parser explicitly
                        // declared the parameter optional.
                        param._featherOptionalParameter = false;
                    } catch {}
                    changed = true;
                } else {
                    // If a DefaultParameter already has a concrete right-hand
                    // side but lacks an explicit `_featherOptionalParameter`
                    // annotation, treat it as a parser-intended optional
                    // parameter. This covers cases where an upstream parser
                    // transform produced a complete DefaultParameter node
                    // but didn't set the flag—such parameters should be
                    // considered authoritative for downstream printing and
                    // doc generation. Do not override an explicit boolean
                    // value if present.
                    try {
                        if (param._featherOptionalParameter == null) {
                            param._featherOptionalParameter = true;
                        }
                    } catch {}
                }
                seenDefaultToLeft = true;
                continue;
            }

            // Treat source-level assignment patterns (e.g. `param = 1`) as an
            // explicit default to the left so trailing bare identifiers are
            // materialized. Do not mutate AssignmentPattern nodes themselves;
            // just record that we've seen a default to the left.
            if (param.type === "AssignmentPattern") {
                seenDefaultToLeft = true;
                continue;
            }

            // If we've already encountered a DefaultParameter to the left
            // then bare identifiers to the right should be treated as
            // implicitly optional and materialized with an explicit
            // `undefined` initializer.
            if (param.type === "Identifier") {
                if (seenDefaultToLeft) {
                    const defaultParam = {
                        type: "DefaultParameter",
                        left: param,
                        right: { type: "Identifier", name: "undefined" },
                        // Trailing parameters that follow an explicit
                        // DefaultParameter are intended to be optional by
                        // the parser's transformation (they were materialized
                        // to preserve call-site positions). Mark these as
                        // parser-intended optional so downstream printers
                        // and doc generators emit the expected optional
                        // syntax.
                        _featherOptionalParameter: true
                    };

                    params[i] = defaultParam;
                    changed = true;
                }

                // If we haven't yet seen a default to the left, this
                // identifier remains required; continue scanning.
                continue;
            }

            // Any other parameter form stops the left-to-right scanning; it
            // indicates a non-standard parameter (rest, pattern, etc.) that
            // should prevent later implicit materialization.
            break;
        }

        return changed;
    }

    // After we've canonicalized DefaultParameter nodes, collect implicit
    // `argumentN` references for the function and attach a compact summary
    // onto the node so downstream consumers can make decisions without
    // re-traversing the function body or inspecting raw source text. This
    // keeps the doc-comment synthesis logic within parser transforms.
    try {
        const implicitInfo = collectImplicitArgumentReferences(node, helpers);
        if (implicitInfo && Array.isArray(implicitInfo)) {
            // Attach as a durable property the parser-side implicit doc
            // entries. Each entry mirrors the shape used by the printer so
            // minimal plumbing is required downstream.
            node._featherImplicitArgumentDocEntries = implicitInfo;
        }
    } catch {}

    // Consult any doc comments attached to this function and mark
    // DefaultParameter nodes that have `undefined` on the right with a
    // durable `_featherOptionalParameter` flag that encodes whether the
    // parameter should be treated as intentionally optional (true) or
    // omitted by the printer where appropriate (false). This shifts the
    // structural decision into the parser so the plugin can remain a
    // view-layer consumer.
    try {
        const docManager = prepareDocCommentEnvironment(ast);
        const comments = docManager.getComments(node);
        const paramDocMap = new Map();
        if (Array.isArray(comments) && comments.length > 0) {
            for (const comment of comments) {
                if (!comment || typeof comment.value !== "string") continue;
                const m = comment.value.match(/@param\s*(?:\{[^}]*\}\s*)?(\[[^\]]+\]|\S+)/i);
                if (!m) continue;
                const raw = m[1];
                const name = raw ? raw.replace(/^\[|\]$/g, "").trim() : null; // eslint-disable-line unicorn/prefer-string-replace-all
                const isOptional = raw ? /^\[.*\]$/.test(raw) : false;
                if (name) {
                    paramDocMap.set(name, isOptional);
                }
            }
        }

        // Walk parameters and set the flag where the RHS is an `undefined`
        // sentinel. Constructors prefer to preserve optional syntax by
        // default; plain functions omit unless the doc indicates optional.
        const params = toMutableArray(node.params);
        for (let i = 0; i < params.length; i += 1) {
            const p = params[i];
            if (!p) continue;

            // Handle both DefaultParameter and AssignmentPattern shapes.
            let leftName = null;
            let rightNode = null;
            if (p.type === "DefaultParameter") {
                leftName = p.left && p.left.type === "Identifier" ? p.left.name : null;
                rightNode = p.right;
            } else if (p.type === "AssignmentPattern") {
                leftName = p.left && p.left.type === "Identifier" ? p.left.name : null;
                rightNode = p.right;
            } else {
                continue;
            }

            // Use the helper so we correctly detect the parser's undefined
            // sentinel regardless of the exact node shape (Identifier vs
            // Literal placeholder passed through by upstream transforms).
            const isUndefined = typeof isUndefinedLiteral === "function" && isUndefinedLiteral(rightNode);
            if (!isUndefined) continue;

            // If doc explicitly marks optional, respect that.
            if (leftName && paramDocMap.has(leftName)) {
                try {
                    p._featherOptionalParameter = paramDocMap.get(leftName) === true;
                } catch {}
                continue;
            }

            // Constructors keep optional syntax by default when the signature
            // contains explicit undefined defaults.
            if (node.type === "ConstructorDeclaration") {
                try {
                    p._featherOptionalParameter = true;
                } catch {}
                continue;
            }

            // Otherwise plain function declarations should omit redundant
            // `= undefined` signatures unless parser transforms explicitly
            // intended them to be optional.
            try {
                p._featherOptionalParameter = false;
            } catch {}
        }
    } catch {}

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
        let assignment;
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

        // Pattern B (prefer): assignment reads from an `argument[index]` on
        // the RHS and assigns into a local variable (e.g.
        // `setting = argument[1];`). Detect this first so we don't
        // mis-classify such assignments as Pattern A (assignment into a
        // local identifier whose RHS may also look like an argument
        // projection).
        if (right && right.type === "MemberIndexExpression") {
            const single = getSingleMemberIndexPropertyEntry(right);
            if (single) {
                const indexText = helpers.getIdentifierText(single);
                const indexNumber = Number(indexText);
                if (
                    !Number.isNaN(indexNumber) &&
                    indexNumber === argumentIndex
                ) {
                    // If the LHS is a local identifier, expose it as the
                    // targetName so callers can map this projection back
                    // to a parameter with the same name.
                    if (left && left.type === "Identifier") {
                        const leftName = getIdentifierText(left);
                        return {
                            argumentExpression: right,
                            targetName: leftName
                        };
                    }

                    return { argumentExpression: right };
                }
            }
        }

        // Pattern A: assignment writes into an `argumentN` target
        // (e.g. `argument0 = foo;`) or into a local identifier
        // (e.g. `arg = foo;`). When the left-hand side is a plain
        // identifier that is NOT an `argumentN` target, treat that
        // identifier as the projected parameter name (`targetName`) so
        // downstream logic can match it against declared parameters.
        if (left.type === "Identifier") {
            const name = getIdentifierText(left);
            if (name && name.toLowerCase().startsWith("argument")) {
                const suffix = name.slice(8);
                const idx = Number(suffix);
                if (!Number.isNaN(idx) && idx === argumentIndex) {
                    return { fallbackExpression: right };
                }
            } else if (name) {
                // Assignment into a local identifier that projects the
                // argument value (or a fallback) — capture the local
                // identifier name so we can correlate it with a
                // parameter of the same name.
                return { fallbackExpression: right, targetName: name };
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

        // Normalize common relational operators into an argument index
        // that the rest of the matcher logic can use. The mapping below
        // intentionally covers <= and >= as well as loose/strict
        // equality/inequality so a broader set of real-world parser
        // patterns are recognized.
        switch (operator) {
            case "<": {
                // e.g. if (argument_count < 2) => missing argument index 1
                return { argumentIndex: rightNumber - 1 };
            }
            case "<=": {
                // e.g. if (argument_count <= 1) => missing argument index 1
                return { argumentIndex: rightNumber };
            }
            case ">": {
                // e.g. if (argument_count > 0) => presence of argument 0
                return { argumentIndex: rightNumber };
            }
            case ">=": {
                // e.g. if (argument_count >= 1) => presence of argument 1
                return { argumentIndex: rightNumber - 1 };
            }
            case "==":
            case "===": {
                return { argumentIndex: rightNumber };
            }
            case "!=":
            case "!==": {
                // Negated equality commonly guards the opposite branch; map
                // to the same index so callers can reason about the guarded
                // argument position and then inspect the consequent/alternate
                // forms to determine fallback vs argument projection.
                return { argumentIndex: rightNumber };
            }
            default: {
                return null;
            }
        }
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

        // Parser-side synthesized defaults use DefaultParameter nodes.
        if (param.type === "DefaultParameter") {
            return param.left;
        }

        return null;
    }

    // --- Implicit argument doc collection (parser-side) ---
    function collectImplicitArgumentReferences(functionNode, helpers) {
        if (!functionNode || functionNode.type !== "FunctionDeclaration") {
            return [];
        }

        const referencedIndices = new Set();
        const aliasByIndex = new Map();
        const directReferenceIndices = new Set();

        function visit(node, parent, property) {
            if (!node || typeof node !== "object") return;

            // Don't descend into nested functions
            if (
                node !== functionNode &&
                (node.type === "FunctionDeclaration" ||
                    node.type === "StructFunctionDeclaration" ||
                    node.type === "FunctionExpression" ||
                    node.type === "ConstructorDeclaration")
            ) {
                return;
            }

            // Variable declarator alias: `var two = argument[2];`
            if (node.type === "VariableDeclarator") {
                const aliasIndex = getArgumentIndexFromNode(node.init);
                if (
                    aliasIndex !== null &&
                    node.id?.type === "Identifier" &&
                    !aliasByIndex.has(aliasIndex)
                ) {
                    const aliasName = node.id.name && String(node.id.name).trim();
                    if (aliasName && aliasName.length > 0) {
                        aliasByIndex.set(aliasIndex, aliasName);
                        referencedIndices.add(aliasIndex);
                    }
                }
            }

            const directIndex = getArgumentIndexFromNode(node);
            if (directIndex !== null) {
                referencedIndices.add(directIndex);
                // If this is not the initializer of an alias we counted above
                // mark it as a direct reference.
                directReferenceIndices.add(directIndex);
            }

            forEachNodeChild(node, (value, key) => {
                // If we detected an alias on this node, don't traverse its
                // initializer twice for direct references.
                if (node.type === "VariableDeclarator" && key === "init") {
                    const aliasIndex = getArgumentIndexFromNode(node.init);
                    if (aliasIndex !== null) return;
                }

                visit(value, node, key);
            });
        }

        visit(functionNode.body, functionNode, "body");

        if (!referencedIndices || referencedIndices.size === 0) return [];

        const sorted = [...referencedIndices].sort((a, b) => a - b);
        return sorted.map((index) => {
            const fallbackName = `argument${index}`;
            const alias = aliasByIndex.get(index);
            const docName = alias && alias.length > 0 ? alias : fallbackName;
            const canonical =
                (typeof docName === "string" && docName.toLowerCase()) ||
                docName;
            const fallbackCanonical =
                (typeof fallbackName === "string" && fallbackName.toLowerCase()) ||
                fallbackName;

            return {
                name: docName,
                canonical,
                fallbackCanonical,
                index,
                hasDirectReference: directReferenceIndices.has(index) === true
            };
        });
    }

    function getArgumentIndexFromNode(node) {
        if (!node || typeof node !== "object") return null;

        if (node.type === "Identifier") {
            return getArgumentIndexFromIdentifier(node.name);
        }

        if (
            node.type === "MemberIndexExpression" &&
            node.object?.type === "Identifier" &&
            node.object.name === "argument" &&
            Array.isArray(node.property) &&
            node.property.length === 1 &&
            node.property[0]?.type === "Literal"
        ) {
            const literal = node.property[0];
            const parsed = Number.parseInt(literal.value, 10);
            return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
        }

        return null;
    }

    function getArgumentIndexFromIdentifier(name) {
        if (typeof name !== "string") return null;
        const match = name.match(/^argument(\d+)$/);
        if (!match) return null;
        const parsed = Number.parseInt(match[1], 10);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }
}
