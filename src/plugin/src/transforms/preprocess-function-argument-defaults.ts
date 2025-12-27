/**
 * Ensures optional function parameters with implicit `undefined` defaults are materialized before downstream transforms run.
 */
import {
    Core,
    type MutableGameMakerAstNode,
    type GameMakerAstNode
} from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";

type PreprocessFunctionArgumentDefaultsTransformOptions = Record<string, never>;

function hasExplicitDefaultParameterToLeft(
    node: MutableGameMakerAstNode,
    parameter: GameMakerAstNode | null
): boolean {
    if (!Core.isObjectLike(node) || !Array.isArray(node.params)) {
        return false;
    }

    try {
        const paramsList: Array<GameMakerAstNode | null> = Core.toMutableArray(
            node.params
        );
        const idx = paramsList.indexOf(parameter);
        if (idx <= 0) {
            return false;
        }

        for (let offset = 0; offset < idx; offset += 1) {
            const leftParam = paramsList[offset];
            if (!leftParam) {
                continue;
            }

            if (
                leftParam.type === "DefaultParameter" &&
                leftParam.right != null
            ) {
                if (leftParam._featherMaterializedTrailingUndefined === true) {
                    continue;
                }

                if (!Core.isUndefinedSentinel(leftParam.right)) {
                    return true;
                }

                continue;
            }

            if (leftParam.type === "AssignmentPattern") {
                return true;
            }
        }
    } catch {
        // swallow errors
    }

    return false;
}

/** Orchestrates the normalization of function parameter default values. */
export class PreprocessFunctionArgumentDefaultsTransform extends FunctionalParserTransform<PreprocessFunctionArgumentDefaultsTransformOptions> {
    constructor() {
        super("preprocess-function-argument-defaults", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        _options: PreprocessFunctionArgumentDefaultsTransformOptions
    ) {
        // Visit each function/constructor once and ensure trailing undefined defaults are explicitly modeled.
        void _options;
        if (!Core.isObjectLike(ast)) {
            return ast;
        }

        this.traverse(ast, (node) => {
            if (
                !node ||
                (node.type !== "FunctionDeclaration" &&
                    node.type !== "ConstructorDeclaration")
            ) {
                return;
            }

            this.preprocessFunctionDeclaration(node, ast);
        });

        return ast;
    }

    // DFS helper that guards against cyclic references while invoking `visitor` on each node.
    private traverse(node, visitor, seen = new Set()) {
        if (!Core.isObjectLike(node)) {
            return;
        }

        if (seen.has(node)) {
            return;
        }

        seen.add(node);

        if (Array.isArray(node)) {
            for (const child of node) {
                this.traverse(child, visitor, seen);
            }
            return;
        }

        visitor(node);

        Core.forEachNodeChild(node, (value, key) => {
            if (key === "parent") {
                return;
            }

            this.traverse(value, visitor, seen);
        });
    }

    // Normalize the parameters and apply argument_count fallback rewrites within a single declaration.
    private preprocessFunctionDeclaration(node, ast) {
        if (
            !node ||
            (node.type !== "FunctionDeclaration" &&
                node.type !== "ConstructorDeclaration")
        ) {
            return;
        }

        if (node._hasProcessedArgumentCountDefaults) {
            return;
        }

        node._hasProcessedArgumentCountDefaults = true;

        const body = node.body;
        if (!body || body.type !== "BlockStatement") {
            return;
        }

        const params = Core.toMutableArray(node.params) as Array<any>;
        if (!Array.isArray(node.params)) {
            node.params = params;
        }

        const statements = Core.getBodyStatements(
            body as Record<string, unknown>
        ) as GameMakerAstNode[];
        const statementsToRemove = new Set();
        let appliedChanges = false;

        if (ensureTrailingOptionalParametersHaveUndefinedDefaults(params)) {
            appliedChanges = true;
        }

        // Finalization helper: materialize any trailing DefaultParameter nodes
        // that were left with a null `right` after we've attempted to apply
        // in-body fallbacks. Run this *before* we early-return so the
        // conservative materialization occurs even when no in-body matches
        // were detected.
        // Defer finalization until after we've attempted to convert any
        // in-body fallback patterns into DefaultParameter nodes. Running
        // the conservative trailing-undefined materialization earlier had
        // subtle interactions with the argument_count condensing logic and
        // produced unexpected DefaultParameter nodes in some fixtures.
        // We'll invoke finalization once we've processed any matches below.

        // If there are no body statements left, run finalization so that
        // trailing placeholders are still materialized in the simple case
        // where no in-body matches exist. This mirrors the previous
        // conservative behavior while avoiding premature finalization in
        // more complex match paths.
        try {
            if (
                statements.length === 0 &&
                !appliedChanges &&
                finalizeTrailingUndefinedDefaults(params)
            ) {
                appliedChanges = true;
            }
        } catch {
            // swallow
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
                ifStatement
            );

            if (!condenseMatch) {
                continue;
            }

            console.log(
                "[DEBUG] Found condenseMatch in preprocessFunctionDeclaration"
            );
            condenseMatches.push(condenseMatch);
        }

        applyCondenseMatches({
            condenseMatches,
            statementsToRemove,
            body
        });

        const paramInfoByName = new Map();
        for (const [index, param] of params.entries()) {
            const identifier = getIdentifierFromParameter(param);
            if (!identifier) {
                continue;
            }

            const name = Core.getIdentifierText(identifier);
            if (!name) {
                continue;
            }

            paramInfoByName.set(name, { index, identifier });
        }

        const matches = [];

        for (const [statementIndex, statement] of statements.entries()) {
            const match = matchArgumentCountFallbackStatement(statement);

            // If this statement looks like an argument_count guard but our
            // stricter matcher didn't recognize it, emit a short diagnostic so

            if (!match) {
                continue;
            }
            matches.push({
                ...match,
                statementIndex
            });
        }

        ensureTrailingOptionalParametersHaveUndefinedDefaults(params);

        // Always proceed to the finalization pass even when no in-body
        // matches were detected. The finalization step materializes
        // trailing placeholder parameters into explicit `= undefined`
        // defaults when a concrete default appears to the left. Running
        // the finalization unconditionally avoids missing cases where the
        // function body contains unrelated statements but no argument_count
        // fallback matches.

        matches.sort((a, b) => {
            if (a.argumentIndex !== b.argumentIndex) {
                return a.argumentIndex - b.argumentIndex;
            }

            return a.statementIndex - b.statementIndex;
        });

        applyArgumentCountMatches({
            matches,
            params,
            node,
            statements,
            statementsToRemove,
            paramInfoByName
        });

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
        }

        // Remove matched fallback statements in reverse order to keep indices stable.
        const orderedRemovals = Array.from(statementsToRemove);
        orderedRemovals.sort(
            (a, b) => Core.getNodeStartIndex(b) - Core.getNodeStartIndex(a)
        );

        for (const removal of orderedRemovals) {
            const index = statements.indexOf(removal);
            if (index !== -1) {
                statements.splice(index, 1);
            }
        }

        processFallbackIfStatements({
            statements,
            node,
            params,
            paramInfoByName
        });

        // After we've processed all in-body fallback matches and removals,

        // After we've processed all in-body fallback matches and removals,
        // run the trailing undefined finalization to materialize any
        // remaining placeholders conservatively.
        try {
            finalizeTrailingUndefinedDefaults(params);
        } catch {
            // swallow
        }

        // Final pass: materialize any trailing DefaultParameter or Identifier
        // parameters that were left without a concrete RHS after we've
        // attempted to apply in-body fallbacks. Historically the formatter
        // emitted `= undefined` for trailing parameters when a concrete
        // default appeared to the left (e.g. `a, b = 1, c` -> `c = undefined`).
        // Here we conservatively reproduce that behavior by locating the
        // last explicit default to the left and materializing all subsequent
        // bare or placeholder parameters to DefaultParameter nodes with an
        // `undefined` Identifier RHS. This deterministic pass avoids
        // reliance on traversal order while remaining safe for non-standard
        // parameter forms.
        try {
            if (materializeTrailingDefaults(params)) {
                appliedChanges = true;
            }
        } catch {
            // Swallow any accidental errors in the conservative finalization
        }

        // Ensure we wrote back any mutated params array so the canonical node
        // reflects our finalization changes for downstream passes.
        try {
            node.params = params;
        } catch {
            // ignore
        }

        // Normalize any parser-produced DefaultParameter nodes that have a
        // missing RHS back into bare Identifier parameters when they are not
        // considered optional. The parser sometimes emits DefaultParameter with
        // a null `right` for plain parameters; downstream tests expect
        // required parameters to be plain Identifiers unless materialized or
        // explicitly marked optional.
        try {
            for (let i = 0; i < (node.params || []).length; i += 1) {
                const p = node.params[i];
                if (
                    p &&
                    p.type === "DefaultParameter" &&
                    (p.right === null || p.right === undefined)
                ) {
                    // Preserve explicitly optional/materialized defaults.
                    if (
                        p._featherOptionalParameter === true ||
                        p._featherMaterializedTrailingUndefined === true ||
                        p._featherMaterializedFromExplicitLeft === true
                    ) {
                        continue;
                    }

                    // Replace the DefaultParameter node with its left Identifier
                    // to represent a required parameter.
                    if (p.left && p.left.type === "Identifier") {
                        node.params[i] = p.left;
                    }
                }
            }
        } catch {
            // swallow normalization errors
        }

        // Post-finalization sweep: ensure materializations that originated from
        // an explicit left-side default are marked optional by default. This
        // preserves the historical printing behaviour expected by plugin tests
        // where trailing parameters following an explicit default are treated
        // as optional (i.e. printed as `= undefined`) unless docs or parser
        // annotations explicitly override that intent.
        // Post-finalization: do not force `_featherOptionalParameter` here. Leave
        // optionality decisions to the doc-driven reconciliation pass which runs
        // immediately after finalization and has authoritative doc-comment data.

        // After finalization and writing back params, run reconciliation again
        // so any `_featherMaterializedFromExplicitLeft` or related flags that
        // were set during finalization are respected when deciding optionality.
        try {
            reconcileDocOptionality(node, ast);
        } catch {
            // swallow
        }

        // After we've canonicalized DefaultParameter nodes, collect implicit
        // `argumentN` references for the function and attach a compact summary
        // onto the node so downstream consumers can make decisions without
        // re-traversing the function body or inspecting raw source text. This
        // keeps the doc-comment synthesis logic within parser transforms.
        try {
            const implicitInfo = collectImplicitArgumentReferences(node);
            if (implicitInfo && Array.isArray(implicitInfo)) {
                // Attach as a durable property the parser-side implicit doc
                // entries. Each entry mirrors the shape used by the printer so
                // minimal plumbing is required downstream.
                node._featherImplicitArgumentDocEntries = implicitInfo;
            }
        } catch {
            // Swallow errors; this is a best-effort enhancement.
        }

        // Helper: run doc-driven reconciliation to set `_featherOptionalParameter`
        // for parameters whose RHS is the parser `undefined` sentinel. We may
        // invoke this both before and *after* finalization because some
        // materializations that indicate explicit-left origins are created in a
        // later pass; running the reconciliation again ensures those durable
        // flags are honored.
        // Run reconciliation early to pick up explicit doc overrides that apply
        // to any materialized placeholders produced so far. We'll run it again
        // after finalization to honor flags created later in the transform.
        try {
            reconcileDocOptionality(node, ast);
        } catch {
            // swallow
        }
    }
}

function finalizeTrailingUndefinedDefaults(params: Array<any>): boolean {
    let changed = false;
    try {
        let seenExplicitDefaultToLeft = false;
        for (let i = 0; i < params.length; i += 1) {
            const param = params[i];
            if (!param) continue;

            if (param.type === "DefaultParameter") {
                if (param.right == null) {
                    if (seenExplicitDefaultToLeft) {
                        param.right = {
                            type: "Literal",
                            value: "undefined"
                        };
                        param._featherMaterializedTrailingUndefined = true;
                        param._featherMaterializedFromExplicitLeft = true;
                        param._featherOptionalParameter = true;
                        changed = true;
                    }
                } else {
                    const isUndef = Core.isUndefinedSentinel(param.right);
                    if (!isUndef) {
                        seenExplicitDefaultToLeft = true;
                    }
                }
                continue;
            }

            if (param.type === "AssignmentPattern") {
                seenExplicitDefaultToLeft = true;
                continue;
            }

            if (param.type === "Identifier") {
                if (seenExplicitDefaultToLeft) {
                    const defaultParam = {
                        type: "DefaultParameter",
                        left: param,
                        right: { type: "Literal", value: "undefined" },
                        _featherMaterializedTrailingUndefined: true,
                        _featherMaterializedFromExplicitLeft: true
                    };
                    params[i] = defaultParam;
                    changed = true;
                }
                continue;
            }

            break;
        }
    } catch {
        // swallow
    }

    return changed;
}

function extendStatementEndLocation(
    targetDeclaration: GameMakerAstNode | null | undefined,
    removedStatement: GameMakerAstNode | null | undefined
) {
    if (!targetDeclaration || !removedStatement) {
        return;
    }

    const removalEnd = Core.getNodeEndIndex(removedStatement);
    if (removalEnd == null) {
        return;
    }

    const declarationEnd = Core.getNodeEndIndex(targetDeclaration);
    if (declarationEnd != null && declarationEnd >= removalEnd) {
        return;
    }

    Core.assignClonedLocation(targetDeclaration, {
        end: removedStatement.end
    });

    const removedRange = (removedStatement as any).range;
    const removedRangeEnd = Array.isArray(removedRange)
        ? removedRange[1]
        : Core.getNodeEndIndex(removedStatement);

    if (typeof removedRangeEnd !== "number") {
        return;
    }

    const targetRange = (targetDeclaration as any).range;
    if (Array.isArray(targetRange)) {
        const [startRange] = targetRange;
        (targetDeclaration as any).range = [startRange, removedRangeEnd];
        return;
    }

    const declarationStart = Core.getNodeStartIndex(targetDeclaration);
    if (typeof declarationStart !== "number") {
        return;
    }

    (targetDeclaration as any).range = [declarationStart, removedRangeEnd];
}

function ensureParameterInfoForMatch(
    match: any,
    params: Array<any>,
    paramInfoByName: Map<
        string | null | undefined,
        { index: number; identifier: GameMakerAstNode | null }
    >
) {
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

    const registerInfo = (
        index: number,
        identifier: GameMakerAstNode | null
    ) => {
        const info = { index, identifier };
        paramInfoByName.set(targetName, info);
        return info;
    };

    if (argumentIndex === params.length) {
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
    const identifier = getIdentifierFromParameter(paramAtIndex);
    if (!identifier) {
        return null;
    }

    const identifierName = Core.getIdentifierText(identifier);
    if (targetName && (!identifierName || identifierName !== targetName)) {
        try {
            const fallbackParam = params[argumentIndex];
            const fallBackIdentifier =
                getIdentifierFromParameter(fallbackParam);
            if (fallBackIdentifier) {
                return registerInfo(argumentIndex, fallBackIdentifier);
            }
        } catch {
            // swallow
        }

        return null;
    }

    return registerInfo(argumentIndex, identifier);
}

function ensureTrailingOptionalParametersHaveUndefinedDefaults(
    params: Array<any>
) {
    if (!Array.isArray(params) || params.length === 0) {
        return false;
    }

    let changed = false;
    let seenExplicitDefaultToLeft = false;
    for (let i = 0; i < params.length; i += 1) {
        const param = params[i];
        if (!param) {
            continue;
        }

        if (param.type === "DefaultParameter") {
            try {
                if (param.right != null) {
                    const isUndef = Core.isUndefinedSentinel(param.right);
                    if (!isUndef) {
                        seenExplicitDefaultToLeft = true;
                    }
                }
            } catch {
                // swallow
            }

            continue;
        }

        if (param.type === "AssignmentPattern") {
            seenExplicitDefaultToLeft = true;
            continue;
        }

        if (param.type === "Identifier") {
            if (seenExplicitDefaultToLeft) {
                const defaultParam = {
                    type: "DefaultParameter",
                    left: param,
                    right: { type: "Literal", value: "undefined" },
                    _featherMaterializedTrailingUndefined: true,
                    _featherMaterializedFromExplicitLeft: true
                };
                params[i] = defaultParam;
                changed = true;
            }
            continue;
        }

        break;
    }

    return changed;
}

function reconcileDocOptionality(
    node: MutableGameMakerAstNode,
    ast: MutableGameMakerAstNode
) {
    try {
        const docManager = Core.prepareDocCommentEnvironment(ast);
        const comments = docManager.getComments(node);

        const paramDocMap = new Map<string, boolean>();
        if (Core.isNonEmptyArray(comments)) {
            for (const comment of comments) {
                if (!comment || typeof comment.value !== "string") continue;
                const m = comment.value.match(
                    /@param\s*(?:\{[^}]*\}\s*)?(\[[^\]]+\]|\S+)/i
                );
                if (!m) continue;
                const raw = m[1];
                const name = raw ? raw.replaceAll(/^\[|\]$/g, "").trim() : null;
                const isOptional = raw ? /^\[.*\]$/.test(raw) : false;
                if (name) {
                    paramDocMap.set(name, isOptional);
                }
            }
        }

        const params = Core.toMutableArray(node.params) as Array<any>;
        for (const p of params) {
            if (!p) continue;

            let leftName: string | null = null;
            let rightNode: GameMakerAstNode | null = null;
            if (p.type === "DefaultParameter") {
                leftName =
                    p.left && p.left.type === "Identifier" ? p.left.name : null;
                rightNode = p.right as GameMakerAstNode | null;
            } else if (p.type === "AssignmentPattern") {
                leftName =
                    p.left && p.left.type === "Identifier" ? p.left.name : null;
                rightNode = p.right as GameMakerAstNode | null;
            } else {
                continue;
            }

            const isUndefined = Core.isUndefinedSentinel(rightNode);
            if (!isUndefined) continue;

            if (leftName && paramDocMap.has(leftName)) {
                try {
                    p._featherOptionalParameter =
                        paramDocMap.get(leftName) === true;
                } catch {
                    // swallow
                }
                continue;
            }

            try {
                if (
                    p._featherOptionalParameter === true ||
                    p._featherOptionalParameter === false
                ) {
                    continue;
                }
            } catch {
                // swallow
            }

            try {
                if (
                    p._featherMaterializedFromExplicitLeft === true &&
                    hasExplicitDefaultParameterToLeft(node, p)
                ) {
                    p._featherOptionalParameter = true;
                    continue;
                }

                if (p._featherMaterializedTrailingUndefined === true) {
                    p._featherOptionalParameter = false;
                    continue;
                }
            } catch {
                // swallow
            }

            if (node.type === "ConstructorDeclaration") {
                try {
                    p._featherOptionalParameter = true;
                } catch {
                    // swallow
                }
                continue;
            }

            try {
                p._featherOptionalParameter = false;
            } catch {
                // swallow
            }
        }
    } catch {
        // swallow
    }
}

function matchArgumentCountFallbackVarThenIf(varStatement, ifStatement) {
    if (!varStatement || varStatement.type !== "VariableDeclaration") {
        return null;
    }

    if (!ifStatement || ifStatement.type !== "IfStatement") {
        return null;
    }

    const declarator = Core.getSingleVariableDeclarator(varStatement);
    if (!declarator) {
        return null;
    }

    const { id, init } = declarator;
    if (!id || id.type !== "Identifier" || !init) {
        return null;
    }

    const match = matchArgumentCountFallbackStatement(ifStatement);
    if (!match) {
        return null;
    }

    const resultantArgumentExpression =
        match.argumentExpression === undefined ? id : match.argumentExpression;
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

function matchArgumentCountFallbackStatement(statement) {
    if (!statement) {
        return null;
    }

    if (statement.type === "IfStatement") {
        const condition = Core.unwrapParenthesizedExpression(statement.test);
        const result = matchArgumentCountGuard(condition);
        if (!result) {
            return null;
        }

        const argumentIndex = result.argumentIndex;

        const consequentBlock = statement.consequent;
        const alternateBlock = statement.alternate;

        const consequentStatements = consequentBlock
            ? consequentBlock.type === "BlockStatement"
                ? Core.getBodyStatements(consequentBlock)
                : [consequentBlock]
            : [];

        const alternateStatements = alternateBlock
            ? alternateBlock.type === "BlockStatement"
                ? Core.getBodyStatements(alternateBlock)
                : [alternateBlock]
            : [];

        let foundArgMatch = null;
        let foundFallbackMatch = null;

        for (const stmt of consequentStatements) {
            const match = matchAssignmentToArgumentIndex(stmt, argumentIndex);
            if (!match) continue;
            if (match.argumentExpression && !foundArgMatch) {
                foundArgMatch = match;
            }
            if (match.fallbackExpression && !foundFallbackMatch) {
                foundFallbackMatch = match;
            }
        }

        for (const stmt of alternateStatements) {
            const match = matchAssignmentToArgumentIndex(stmt, argumentIndex);
            if (!match) continue;
            if (match.argumentExpression && !foundArgMatch) {
                foundArgMatch = match;
            }
            if (match.fallbackExpression && !foundFallbackMatch) {
                foundFallbackMatch = match;
            }
        }

        if (foundArgMatch || foundFallbackMatch) {
            const targetName =
                (foundFallbackMatch && foundFallbackMatch.targetName) ||
                (foundArgMatch && foundArgMatch.targetName);

            return {
                argumentIndex,
                targetName,
                fallbackExpression: foundFallbackMatch
                    ? foundFallbackMatch.fallbackExpression
                    : undefined,
                argumentExpression: foundArgMatch
                    ? foundArgMatch.argumentExpression
                    : undefined,
                statementNode: statement,
                guardExpression: condition
            };
        }
    }

    return null;
}

function matchAssignmentToArgumentIndex(node, argumentIndex) {
    if (!node) {
        return null;
    }

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

    if (right && right.type === "MemberIndexExpression") {
        const single = Core.getSingleMemberIndexPropertyEntry(right);
        if (single) {
            const indexText = Core.getIdentifierText(single);
            const indexNumber = Number(indexText);
            if (!Number.isNaN(indexNumber) && indexNumber === argumentIndex) {
                if (left && left.type === "Identifier") {
                    const leftName = Core.getIdentifierText(left);
                    return {
                        argumentExpression: right,
                        targetName: leftName
                    };
                }
                return { argumentExpression: right };
            }
        }
    }

    if (left.type === "Identifier") {
        const name = Core.getIdentifierText(left);
        if (name && name.toLowerCase().startsWith("argument")) {
            const suffix = name.slice(8);
            const idx = Number(suffix);
            if (!Number.isNaN(idx) && idx === argumentIndex) {
                return { fallbackExpression: right };
            }
        } else if (name) {
            return { fallbackExpression: right, targetName: name };
        }
    }

    if (left.type === "MemberIndexExpression") {
        const single = Core.getSingleMemberIndexPropertyEntry(left);
        if (!single) {
            return null;
        }

        const indexText = Core.getIdentifierText(single);
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

    const leftIsSubject = !!resolveNodeToArgumentCountSubject(left);
    const rightIsSubject = !!resolveNodeToArgumentCountSubject(right);

    if (!leftIsSubject && !rightIsSubject) return null;

    let numericNode;
    let normalizedOperator = operator;
    if (leftIsSubject) {
        numericNode = right;
    } else {
        numericNode = left;
        const invert: Record<string, string> = {
            "<": ">",
            "<=": ">=",
            ">": "<",
            ">=": "<=",
            "==": "==",
            "===": "===",
            "!=": "!=",
            "!==": "!=="
        };
        normalizedOperator = invert[operator] || operator;
    }

    let rightNumber;
    try {
        if (
            numericNode &&
            (numericNode.type === "Literal" ||
                numericNode.type === "NumericLiteral") &&
            (typeof numericNode.value === "number" ||
                /^[0-9]+$/.test(String(numericNode.value)))
        ) {
            rightNumber = Number(numericNode.value);
        } else {
            const txt = Core.getIdentifierText(numericNode);
            rightNumber = Number(txt);
        }
    } catch {
        rightNumber = Number.NaN;
    }

    if (Number.isNaN(rightNumber)) {
        return null;
    }

    switch (normalizedOperator) {
        case "<": {
            return { argumentIndex: rightNumber - 1 };
        }
        case "<=": {
            return { argumentIndex: rightNumber };
        }
        case ">": {
            return { argumentIndex: rightNumber };
        }
        case ">=": {
            return { argumentIndex: rightNumber - 1 };
        }
        case "==":
        case "===": {
            return { argumentIndex: rightNumber };
        }
        case "!=":
        case "!==": {
            return { argumentIndex: rightNumber };
        }
        default: {
            return null;
        }
    }
}

function resolveNodeToArgumentCountSubject(node: any) {
    try {
        const text = Core.getIdentifierText(node);
        if (
            typeof text === "string" &&
            text.toLowerCase() === "argument_count"
        ) {
            return text;
        }

        if (node && typeof node === "object") {
            if (node.type === "MemberExpression" && node.property) {
                const propText = Core.getIdentifierText(node.property);
                if (
                    typeof propText === "string" &&
                    propText.toLowerCase() === "argument_count"
                ) {
                    return propText;
                }
            }

            if (
                node.type === "MemberIndexExpression" &&
                Array.isArray(node.property) &&
                node.property.length === 1
            ) {
                const prop = node.property[0];
                const propText = Core.getIdentifierText(prop);
                if (
                    typeof propText === "string" &&
                    propText.toLowerCase() === "argument_count"
                ) {
                    return propText;
                }
            }
        }
    } catch {
        // defensive: fall through to null
    }

    return null;
}

function getIdentifierFromParameter(
    param: GameMakerAstNode | null | undefined
) {
    if (!param) {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (param.type === "AssignmentPattern") {
        return param.left;
    }

    if (param.type === "DefaultParameter") {
        return param.left;
    }

    return null;
}

function collectImplicitArgumentReferences(functionNode: GameMakerAstNode) {
    if (!functionNode || functionNode.type !== "FunctionDeclaration") {
        return [];
    }

    const referencedIndices = new Set<number>();
    const aliasByIndex = new Map<number, string>();
    const directReferenceIndices = new Set<number>();

    function visit(node: any, parent: any, property: string | number) {
        if (!node || typeof node !== "object") return;

        if (node.type === "VariableDeclarator") {
            const aliasIndex = getArgumentIndexFromNode(node.init);
            if (aliasIndex === 0 && node.id?.name === "first") {
                console.log("DEBUG: FOUND SMOKING GUN: first = argument0");
            }
            console.log(
                "DEBUG: VariableDeclarator",
                node.id?.name,
                "aliasIndex:",
                aliasIndex
            );
        }

        if (
            node !== functionNode &&
            (node.type === "FunctionDeclaration" ||
                node.type === "StructFunctionDeclaration" ||
                node.type === "FunctionExpression" ||
                node.type === "ConstructorDeclaration")
        ) {
            return;
        }

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
            const isInitializerOfAlias =
                parent &&
                parent.type === "VariableDeclarator" &&
                property === "init" &&
                aliasByIndex.has(directIndex);
            if (!isInitializerOfAlias) {
                directReferenceIndices.add(directIndex);
            }
        }

        Core.forEachNodeChild(node, (value, key) => {
            if (node.type === "VariableDeclarator" && key === "init") {
                const aliasIndex = getArgumentIndexFromNode(node.init);
                if (aliasIndex !== null) return;
            }

            visit(value, node, key);
        });
    }

    visit(functionNode.body, functionNode, "body");

    if (!referencedIndices || referencedIndices.size === 0) return [];

    console.log(
        "DEBUG: collectImplicitArgumentReferences result for",
        (functionNode as any).id?.name,
        "aliasByIndex:",
        JSON.stringify(Array.from(aliasByIndex.entries())),
        "referencedIndices:",
        JSON.stringify(Array.from(referencedIndices))
    );

    const sorted = [...referencedIndices].sort((a, b) => a - b);
    return sorted.map((index) => {
        const fallbackName = `argument${index}`;
        const alias = aliasByIndex.get(index);
        console.log(
            "DEBUG: Mapping index",
            index,
            "alias:",
            alias,
            "for function",
            (functionNode as any).id?.name
        );
        const docName = alias && alias.length > 0 ? alias : fallbackName;
        const canonical =
            (typeof docName === "string" && docName.toLowerCase()) || docName;
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

function getArgumentIndexFromNode(node: any) {
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

function getArgumentIndexFromIdentifier(name: unknown) {
    if (typeof name !== "string") return null;
    const match = name.match(/^argument(\d+)$/);
    if (!match) return null;
    const parsed = Number.parseInt(match[1]);
    // console.log("DEBUG: getArgumentIndexFromIdentifier", name, parsed);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function applyCondenseMatches(params: {
    condenseMatches: Array<Record<string, any>>;
    statementsToRemove: Set<GameMakerAstNode>;
    body: GameMakerAstNode;
}) {
    const { condenseMatches, statementsToRemove, body } = params;

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
        (body as any)._gmlForceInitialBlankLine = true;
    }
}

function applyArgumentCountMatches(args: {
    matches: Array<any>;
    node: MutableGameMakerAstNode;
    params: Array<any>;
    statements: GameMakerAstNode[];
    statementsToRemove: Set<GameMakerAstNode>;
    paramInfoByName: Map<
        string | null | undefined,
        { index: number; identifier: GameMakerAstNode | null }
    >;
}) {
    const {
        matches,
        node,
        params,
        statements,
        statementsToRemove,
        paramInfoByName
    } = args;

    for (const match of matches) {
        if (!match) {
            continue;
        }

        const paramInfo = ensureParameterInfoForMatch(
            match,
            params,
            paramInfoByName
        );
        if (!paramInfo) {
            continue;
        }

        if (!match.fallbackExpression) {
            continue;
        }

        const currentParam = node.params[paramInfo.index];
        if (!currentParam) {
            continue;
        }

        const paramIsBareIdentifier = currentParam.type === "Identifier";
        const paramIsEmptyDefault =
            currentParam.type === "DefaultParameter" &&
            (currentParam.right == null || currentParam.right === undefined);

        if (!paramIsBareIdentifier && !paramIsEmptyDefault) {
            continue;
        }

        if (match.targetName) {
            removeDeclaredVariable(
                statements,
                match.targetName,
                statementsToRemove
            );
        }

        const identifier = paramInfo.identifier;
        if (!identifier || identifier.type !== "Identifier") {
            continue;
        }

        if (paramIsBareIdentifier) {
            const defaultParamNode = {
                type: "DefaultParameter",
                left: currentParam,
                right: match.fallbackExpression
            };

            try {
                if (Core.isUndefinedSentinel(match.fallbackExpression)) {
                    (
                        defaultParamNode as any
                    )._featherMaterializedTrailingUndefined = true;
                }
            } catch {
                // swallow
            }

            node.params[paramInfo.index] = defaultParamNode;
        } else if (paramIsEmptyDefault) {
            try {
                currentParam.right = match.fallbackExpression;
            } catch {
                // swallow
            }
        }
    }
}

function processFallbackIfStatements(args: {
    statements: GameMakerAstNode[];
    node: MutableGameMakerAstNode;
    params: Array<any>;
    paramInfoByName: Map<
        string | null | undefined,
        { index: number; identifier: GameMakerAstNode | null }
    >;
}) {
    const { statements, node, params, paramInfoByName } = args;

    for (let sidx = 0; sidx < statements.length; sidx += 1) {
        const stmt = statements[sidx];
        if (!stmt || (stmt as any).type !== "IfStatement") continue;

        const condition = Core.unwrapParenthesizedExpression(
            (stmt as any).test
        );
        const guard = matchArgumentCountGuard(condition);
        if (!guard) continue;

        const consequent = (stmt as any).consequent;
        const alternate = (stmt as any).alternate;
        const consequentStmt =
            consequent && consequent.type === "BlockStatement"
                ? Core.getBodyStatements(consequent)[0]
                : consequent;
        const alternateStmt =
            alternate && alternate.type === "BlockStatement"
                ? Core.getBodyStatements(alternate)[0]
                : alternate;

        const a = matchAssignmentToArgumentIndex(
            consequentStmt,
            guard.argumentIndex
        );
        const b = matchAssignmentToArgumentIndex(
            alternateStmt,
            guard.argumentIndex
        );

        let argMatch = null;
        let fallbackMatch = null;
        if (a && a.argumentExpression) argMatch = a;
        if (a && a.fallbackExpression) fallbackMatch = a;
        if (b && b.argumentExpression) argMatch = b;
        if (b && b.fallbackExpression) fallbackMatch = b;

        if (!argMatch && !fallbackMatch) continue;

        if (!argMatch && !fallbackMatch) continue;

        applyFallbackArgumentMatch({
            node,
            params,
            statements,
            statementNode: stmt,
            guard,
            argMatch,
            fallbackMatch,
            paramInfoByName
        });
    }
}

function applyFallbackArgumentMatch(args: {
    node: MutableGameMakerAstNode;
    params: Array<any>;
    statements: GameMakerAstNode[];
    statementNode: GameMakerAstNode;
    guard: any;
    argMatch: any;
    fallbackMatch: any;
    paramInfoByName: Map<
        string | null | undefined,
        { index: number; identifier: GameMakerAstNode | null }
    >;
}) {
    const {
        node,
        params,
        statements,
        statementNode,
        guard,
        argMatch,
        fallbackMatch,
        paramInfoByName
    } = args;

    const targetName =
        (fallbackMatch && fallbackMatch.targetName) ||
        (argMatch && argMatch.targetName) ||
        null;
    const argumentIndex = guard.argumentIndex;

    let paramIndex = -1;
    if (targetName && paramInfoByName.has(targetName)) {
        paramIndex = paramInfoByName.get(targetName).index;
    } else if (argumentIndex != null && argumentIndex < params.length) {
        paramIndex = argumentIndex;
    }

    if (paramIndex < 0 || paramIndex >= params.length) {
        return;
    }

    const currentParam = node.params[paramIndex];
    if (!currentParam) {
        return;
    }

    const fallbackExpr =
        (fallbackMatch && fallbackMatch.fallbackExpression) ||
        (argMatch && argMatch.fallbackExpression);
    if (!fallbackExpr) {
        return;
    }

    const paramIsBareIdentifier = currentParam.type === "Identifier";
    const paramIsEmptyDefault =
        currentParam.type === "DefaultParameter" &&
        (currentParam.right == null || currentParam.right === undefined);

    if (paramIsBareIdentifier) {
        const defaultParamNode = {
            type: "DefaultParameter",
            left: currentParam,
            right: fallbackExpr
        };
        try {
            if (Core.isUndefinedSentinel(fallbackExpr)) {
                (
                    defaultParamNode as any
                )._featherMaterializedTrailingUndefined = true;
            }
        } catch {
            // swallow
        }
        node.params[paramIndex] = defaultParamNode;
        const ridx = statements.indexOf(statementNode);
        if (ridx !== -1) {
            statements.splice(ridx, 1);
        }
    } else if (paramIsEmptyDefault) {
        try {
            currentParam.right = fallbackExpr;
            if (Core.isUndefinedSentinel(fallbackExpr)) {
                currentParam._featherMaterializedTrailingUndefined = true;
            }
        } catch {
            // swallow
        }
        const ridx = statements.indexOf(statementNode);
        if (ridx !== -1) {
            statements.splice(ridx, 1);
        }
    }
}

function materializeTrailingDefaults(params: Array<any>): boolean {
    let appliedChanges = false;
    let lastExplicitDefaultIndex = -1;
    for (const [i, param] of params.entries()) {
        if (!param) continue;

        if (param.type === "DefaultParameter") {
            if (param.right != null) {
                const isUndef = Core.isUndefinedSentinel(param.right);
                if (!isUndef) {
                    lastExplicitDefaultIndex = i;
                }
            }
            continue;
        }

        if (param.type === "AssignmentPattern") {
            lastExplicitDefaultIndex = i;
            continue;
        }
    }

    if (lastExplicitDefaultIndex < 0) {
        return appliedChanges;
    }

    for (let i = 0; i < params.length; i += 1) {
        const param = params[i];
        if (!param) continue;

        if (i <= lastExplicitDefaultIndex) {
            continue;
        }

        if (param.type === "DefaultParameter") {
            if (param.right == null) {
                param.right = {
                    type: "Literal",
                    value: "undefined"
                };
                param._featherMaterializedTrailingUndefined = true;
                param._featherMaterializedFromExplicitLeft = true;
                param._featherOptionalParameter = true;
                appliedChanges = true;
            }
            continue;
        }

        if (param.type === "Identifier") {
            const defaultParam = {
                type: "DefaultParameter",
                left: param,
                right: { type: "Literal", value: "undefined" },
                _featherMaterializedTrailingUndefined: true,
                _featherMaterializedFromExplicitLeft: true,
                _featherOptionalParameter: true
            };
            params[i] = defaultParam;
            appliedChanges = true;
            continue;
        }

        break;
    }

    return appliedChanges;
}

function removeDeclaredVariable(
    statements: GameMakerAstNode[],
    targetName: string,
    statementsToRemove: Set<GameMakerAstNode>
) {
    for (const stmt of statements) {
        if (!stmt || stmt.type !== "VariableDeclaration") {
            continue;
        }

        const declIndex = stmt.declarations.findIndex((declaration) => {
            const name = Core.getIdentifierText(declaration.id);
            return name === targetName;
        });

        if (declIndex === -1) {
            continue;
        }

        stmt.declarations.splice(declIndex, 1);
        if (stmt.declarations.length === 0) {
            statementsToRemove.add(stmt);
        }
    }
}

export const preprocessFunctionArgumentDefaultsTransform =
    new PreprocessFunctionArgumentDefaultsTransform();
