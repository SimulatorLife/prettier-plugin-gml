import { Core } from "@gml-modules/core";
import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./index.js";

type PreprocessFunctionArgumentDefaultsTransformOptions = Record<string, never>;

function preprocessFunctionArgumentDefaultsImpl(ast: any) {
    if (!Core.isObjectLike(ast)) {
        return ast;
    }

    traverse(ast, (node) => {
        if (
            !node ||
            (node.type !== "FunctionDeclaration" &&
                node.type !== "ConstructorDeclaration")
        ) {
            return;
        }

        preprocessFunctionDeclaration(node, ast);
    });

    return ast;
}

class PreprocessFunctionArgumentDefaultsTransform extends FunctionalParserTransform<PreprocessFunctionArgumentDefaultsTransformOptions> {
    constructor() {
        super("preprocess-function-argument-defaults", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        _options: PreprocessFunctionArgumentDefaultsTransformOptions
    ) {
        return preprocessFunctionArgumentDefaultsImpl(ast);
    }
}

const preprocessFunctionArgumentDefaultsTransform =
    new PreprocessFunctionArgumentDefaultsTransform();

export function preprocessFunctionArgumentDefaults(ast: any) {
    return preprocessFunctionArgumentDefaultsTransform.transform(ast);
}

export const transform = preprocessFunctionArgumentDefaults;

function traverse(node, visitor, seen = new Set()) {
    if (!Core.isObjectLike(node)) {
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

    Core.forEachNodeChild(node, (value, key) => {
        if (key === "parent") {
            return;
        }

        traverse(value, visitor, seen);
    });
}

function preprocessFunctionDeclaration(node, ast) {
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

    const params = Core.toMutableArray(node.params);
    if (!Array.isArray(node.params)) {
        node.params = params;
    }

    const statements = Core.getBodyStatements(body as Record<string, unknown>);
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
    function finalizeTrailingUndefinedDefaults(params) {
        let changed = false;
        try {
            let seenExplicitDefaultToLeft = false;
            for (let i = 0; i < params.length; i += 1) {
                const param = params[i];
                if (!param) continue;

                if (param.type === "DefaultParameter") {
                    if (param.right == null) {
                        if (seenExplicitDefaultToLeft) {
                            // Materialize the sentinel as a Literal so downstream
                            // tests and printer logic that expect a Literal
                            // `value: "undefined"` observe the historical
                            // shape.
                            param.right = {
                                type: "Literal",
                                value: "undefined"
                            };
                            param._featherMaterializedTrailingUndefined = true;
                            param._featherMaterializedFromExplicitLeft = true;
                            // Historical behaviour: when materializing a trailing
                            // undefined because there was an explicit default to
                            // the left, treat the parameter as optional by
                            // default so downstream phases preserve `= undefined`.
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
                            // downstream passes observe the historical
                            // `value: "undefined"` shape.
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

        const removedRangeEnd = Array.isArray(removedStatement.range)
            ? removedStatement.range[1]
            : Core.getNodeEndIndex(removedStatement);

        if (typeof removedRangeEnd !== "number") {
            return;
        }

        if (Array.isArray(targetDeclaration.range)) {
            const [startRange] = targetDeclaration.range;
            targetDeclaration.range = [startRange, removedRangeEnd];
            return;
        }

        const declarationStart = Core.getNodeStartIndex(targetDeclaration);
        if (typeof declarationStart !== "number") {
            return;
        }

        targetDeclaration.range = [declarationStart, removedRangeEnd];
    }

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
        // we can capture the exact AST shape from failing fixtures. This is
        // temporary and will be removed once matchers are hardened.
        try {
            if (
                !match &&
                statement &&
                (statement as any).type === "IfStatement"
            ) {
                const cond = Core.unwrapParenthesizedExpression(
                    (statement as any).test
                );
                const maybeGuard = matchArgumentCountGuard(cond);
                if (maybeGuard) {
                    console.warn(
                        `[feather:diagnostic] missed-strict-match fn=${node && node.id && node.id.name ? node.id.name : "<anon>"} stmtIndex=${statementIndex} argIdx=${maybeGuard.argumentIndex}`
                    );
                }
            }
        } catch {
            // swallow diagnostics
        }

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

        // If the matcher didn't provide a projected targetName, allow
        // matching purely by index when a declared parameter exists at
        // that position. This covers patterns like `if (argument_count == 0)
        // argument0 = "...";` where the assignment targets the
        // argumentN slot directly and the parameter at that index should
        // be updated. When a targetName is provided, preserve the
        // stricter name-matching behaviour.
        const paramAtIndex = params[argumentIndex];
        const identifier = getIdentifierFromParameter(paramAtIndex);
        if (!identifier) {
            return null;
        }

        const identifierName = Core.getIdentifierText(identifier);
        if (targetName && (!identifierName || identifierName !== targetName)) {
            // If the matcher provided a projected target name that doesn't
            // match the declared parameter name at the same index, fall
            // back to index-based matching. This relaxes strict name
            // equality and covers parser shapes where the function uses a
            // different local alias for the projected argument; prefer the
            // declared parameter at the index when available.
            try {
                const paramAtIndex = params[argumentIndex];
                const fallBackIdentifier =
                    getIdentifierFromParameter(paramAtIndex);
                if (fallBackIdentifier) {
                    console.warn(
                        `[feather:diagnostic] relaxed-match targetName=${targetName} index=${argumentIndex} paramName=${Core.getIdentifierText(fallBackIdentifier)}`
                    );
                    return registerInfo(argumentIndex, fallBackIdentifier);
                }
            } catch {
                // if any helper fails, fall through to returning null
            }

            return null;
        }

        return registerInfo(argumentIndex, identifier);
    };

    for (const match of matches) {
        if (!match) {
            continue;
        }

        try {
            // Diagnostic: log the raw match object so we can see what the
            // matcher produced for each IfStatement.

            console.warn(
                `[feather:diagnostic] processing match targetName=${match.targetName} argumentIndex=${match.argumentIndex} hasFallback=${!!match.fallbackExpression} hasArgumentExpr=${!!match.argumentExpression}`
            );
        } catch {
            // swallow
        }

        const paramInfo = ensureParameterInfoForMatch(match);
        try {
            // Diagnostic: report whether we found a parameter mapping
            // for this match.

            console.warn(
                `[feather:diagnostic] paramInfo for match: ${paramInfo ? `index=${paramInfo.index} id=${paramInfo.identifier && paramInfo.identifier.name}` : "<none>"}`
            );
        } catch {
            // swallow
        }
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

        // Accept either a bare Identifier parameter or a previously-
        // materialized DefaultParameter node whose right-hand side is
        // still missing (null). Some upstream parser shapes produce a
        // DefaultParameter with a null `right` placeholder; in that
        // case we should fill in the fallbackExpression rather than
        // skipping conversion.
        const paramIsBareIdentifier = currentParam.type === "Identifier";
        const paramIsEmptyDefault =
            currentParam.type === "DefaultParameter" &&
            (currentParam.right == null || currentParam.right === undefined);

        if (!paramIsBareIdentifier && !paramIsEmptyDefault) {
            continue;
        }

        const identifier = paramInfo.identifier;
        if (!identifier || identifier.type !== "Identifier") {
            continue;
        }

        // If the parameter was a bare identifier, replace it with an
        // explicit DefaultParameter node using the matched fallback.
        // If the parameter was already a DefaultParameter with a
        // missing right-hand side, fill in the right-hand side instead
        // of creating a new node so we preserve any attached metadata.
        if (paramIsBareIdentifier) {
            const defaultParamNode = {
                type: "DefaultParameter",
                left: currentParam,
                right: match.fallbackExpression
            };

            // If the matched fallback is the parser's `undefined` sentinel,
            // mark this synthesized DefaultParameter as optional so downstream
            // phases (printer/doc synthesizer) preserve `= undefined` when
            // the parser intended the parameter to be optional.
            // Intentionally do not set `_featherOptionalParameter` here.
            // Instead record that this DefaultParameter was materialized
            // from an in-body fallback by setting
            // `_featherMaterializedTrailingUndefined` when the fallback is
            // the parser's `undefined` sentinel. The printer uses that
            // signal to avoid treating materialized placeholders as an
            // explicit optional override.
            try {
                if (Core.isUndefinedSentinel(match.fallbackExpression)) {
                    // Mark that this DefaultParameter was materialized from
                    // an in-body fallback whose RHS is the parser's
                    // `undefined` sentinel. Do NOT set `_featherOptionalParameter`
                    // here so the doc-driven reconciliation step remains the
                    // single source of truth for whether the parameter is
                    // intentionally optional. The printer will still inspect
                    // `_featherMaterializedTrailingUndefined` to treat
                    // materialized placeholders differently when synthesizing
                    // docs.
                    (
                        defaultParamNode as any
                    )._featherMaterializedTrailingUndefined = true;
                }
            } catch {
                // swallow
            }

            try {
                // Diagnostic: report what fallback expression we're using
                // when creating a default param so we can trace missed
                // literal fallbacks in fixtures.

                console.warn(
                    `[feather:diagnostic] creating DefaultParameter at index=${paramInfo.index} fallbackType=${match.fallbackExpression && match.fallbackExpression.type}`
                );
            } catch {
                // swallow
            }

            node.params[paramInfo.index] = defaultParamNode;
        } else if (paramIsEmptyDefault) {
            try {
                // Diagnostic: report what we're attempting to fill into the
                // existing DefaultParameter.right so we can see why some
                // placeholder `undefined` values remain.

                console.warn(
                    `[feather:diagnostic] filling DefaultParameter.right index=${paramInfo.index} fallbackType=${match.fallbackExpression && match.fallbackExpression.type}`
                );

                currentParam.right = match.fallbackExpression;

                // Do NOT annotate `_featherOptionalParameter` here; leave
                // that decision to the doc-driven reconciliation step so
                // plain functions omit `= undefined` unless docs or
                // prior parser annotations explicitly indicate optional.
            } catch {
                // swallow
            }
        }
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
    orderedRemovals.sort(
        (a, b) => Core.getNodeStartIndex(b) - Core.getNodeStartIndex(a)
    );

    for (const removal of orderedRemovals) {
        const index = statements.indexOf(removal);
        if (index !== -1) {
            statements.splice(index, 1);
        }
    }

    // As a conservative fallback: some parser shapes may present the
    // argument_count fallback pattern in slightly different AST forms that
    // the stricter matchers above miss. Scan remaining top-level statements
    // for IfStatements that clearly implement an argument_count-based
    // fallback and convert them into DefaultParameter nodes when we can
    // confidently map them to existing parameters.
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

        // Look for an assignment in one branch that assigns an Identifier
        // from argument[index], and in the other branch an assignment that
        // assigns a fallback value into that same Identifier. This is a
        // liberal detection to capture odd parser shapes.
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

        // Determine the target parameter index/name
        const targetName =
            (fallbackMatch && fallbackMatch.targetName) ||
            (argMatch && argMatch.targetName) ||
            null;
        const argumentIndex = guard.argumentIndex;

        // Try to locate parameter by name first, otherwise by index.
        let paramIndex = -1;
        if (targetName && paramInfoByName.has(targetName)) {
            paramIndex = paramInfoByName.get(targetName).index;
        } else if (argumentIndex != null && argumentIndex < params.length) {
            paramIndex = argumentIndex;
        }

        if (paramIndex < 0 || paramIndex >= params.length) continue;
        // Diagnostic instrumentation: if we detected an argument_count
        // guard and found at least one candidate assignment match but
        // couldn't map it to a parameter index or lacked a fallback
        // expression, emit a concise diagnostic. This helps capture the
        // real AST shapes present in failing plugin fixtures so we can
        // improve matcher coverage. This is intended to be temporary.
        try {
            if (
                (argMatch || fallbackMatch) &&
                (!Number.isInteger(paramIndex) ||
                    paramIndex < 0 ||
                    paramIndex >= params.length)
            ) {
                console.warn(
                    `[feather:diagnostic] unmatched-argguard fn=${node && node.id && node.id.name ? node.id.name : "<anon>"} sidx=${sidx} argIdx=${argumentIndex} hadArg=${!!argMatch} hadFallback=${!!fallbackMatch} targetName=${String(targetName)} paramIndex=${paramIndex} paramsLen=${params.length}`
                );
            }
        } catch {
            // swallow diagnostics failures
        }

        const currentParam = node.params[paramIndex];
        if (!currentParam) continue;

        // If the parameter is already a DefaultParameter with RHS present,
        // skip. Otherwise materialize or fill in the default from the
        // fallback match if available.
        const fallbackExpr =
            (fallbackMatch && fallbackMatch.fallbackExpression) ||
            (argMatch && argMatch.fallbackExpression);
        if (!fallbackExpr) continue;

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
                    // Mark that this DefaultParameter was materialized by the
                    // parser/transform pass and that its RHS is the
                    // `undefined` sentinel. Record that it was
                    // materialized so printers can treat materialized
                    // placeholders specially. Do NOT also set the
                    // Mark that this DefaultParameter was materialized by the
                    // parser/transform pass and that its RHS is the
                    // `undefined` sentinel. Record that it was
                    // materialized so printers can treat materialized
                    // placeholders specially. Do NOT also set the
                    // `_featherOptionalParameter` here for argument_count
                    // guard-based materializations; those represent a
                    // different semantic origin and should not imply an
                    // explicit optional intent in all cases.
                    (
                        defaultParamNode as any
                    )._featherMaterializedTrailingUndefined = true;
                }
            } catch {
                // swallow
            }
            node.params[paramIndex] = defaultParamNode;
            // Remove the IfStatement from the body
            const ridx = statements.indexOf(stmt);
            if (ridx !== -1) statements.splice(ridx, 1);
            appliedChanges = true;
            body._gmlForceInitialBlankLine = true;
        } else if (paramIsEmptyDefault) {
            try {
                currentParam.right = fallbackExpr;
                if (Core.isUndefinedSentinel(fallbackExpr)) {
                    // Mark that this DefaultParameter's RHS was filled from an
                    // in-body fallback and that it is the `undefined`
                    // sentinel. Only record that this node was materialized;
                    // leave the explicit optionality decision to the later
                    // doc-driven reconciliation so plain functions omit
                    // redundant `= undefined` unless docs indicate optional.
                    currentParam._featherMaterializedTrailingUndefined = true;
                }
            } catch {
                // swallow
            }
            const ridx = statements.indexOf(stmt);
            if (ridx !== -1) statements.splice(ridx, 1);
            appliedChanges = true;
            body._gmlForceInitialBlankLine = true;
        }
    }

    // After we've processed all in-body fallback matches and removals,
    // run the trailing undefined finalization to materialize any
    // remaining placeholders conservatively.
    try {
        if (finalizeTrailingUndefinedDefaults(params)) {
            appliedChanges = true;
        }
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
        // Diagnostic: show initial param summary before finalization
        try {
            console.error(
                `[feather:diagnostic] finalization-start params=${params.length}`
            );
        } catch {
            /* swallow */
        }

        // Find the highest index of a concrete explicit default to the left.
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

            // Other forms don't affect explicit defaults
        }

        if (lastExplicitDefaultIndex >= 0) {
            try {
                console.warn(
                    `[feather:diagnostic] finalization-found-explicit idx=${lastExplicitDefaultIndex}`
                );
            } catch {
                /* swallow */
            }
        }

        // Only materialize trailing placeholders when we actually found an
        // explicit default to the left; otherwise leave placeholders for
        // other passes to decide.
        if (lastExplicitDefaultIndex >= 0) {
            for (let i = 0; i < params.length; i += 1) {
                const param = params[i];
                if (!param) continue;
                try {
                    console.warn(
                        `[feather:diagnostic] finalization-loop idx=${i} type=${param.type} right=${param && param.right ? param.right.type || typeof param.right : "<null>"} lastExplicit=${lastExplicitDefaultIndex}`
                    );
                } catch {
                    /* swallow */
                }

                if (i <= lastExplicitDefaultIndex) {
                    // Nothing to do for parameters up to and including the last
                    // explicit default.
                    continue;
                }

                if (param.type === "DefaultParameter") {
                    if (param.right == null) {
                        // Materialize placeholder RHS as `undefined` using a
                        // Literal node so the shape matches existing tests.
                        param.right = { type: "Literal", value: "undefined" };
                        param._featherMaterializedTrailingUndefined = true;
                        param._featherMaterializedFromExplicitLeft = true;
                        // Preserve historical behaviour: when materializing a
                        // trailing `= undefined` default due to an explicit
                        // default to the left, mark the parameter as optional
                        // so downstream phases observe the explicit optional
                        // intent.
                        param._featherOptionalParameter = true;
                        appliedChanges = true;
                        try {
                            console.error(
                                `[feather:diagnostic] finalization-materialized index=${i} name=${param.left && param.left.name}`
                            );
                        } catch {
                            /* swallow */
                        }
                    }
                    continue;
                }

                if (param.type === "Identifier") {
                    // Materialize bare identifier to DefaultParameter with
                    // undefined RHS. Use a Literal node for the `undefined`
                    // sentinel to match historical printer/tests expectations.
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

                // Stop on non-standard parameter forms.
                break;
            }
        }

        if (appliedChanges) {
            body._gmlForceInitialBlankLine = true;
        }
    } catch {
        // Swallow any accidental errors in the conservative finalization
    }

    // Ensure we wrote back any mutated params array so the canonical node
    // reflects our finalization changes for downstream passes.
    try {
        console.error(
            `[feather:diagnostic] writing-back-params len=${params?.length ?? 0}`
        );
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
        reconcileDocOptionality();
    } catch {
        // swallow
    }

    // Helpers
    function ensureTrailingOptionalParametersHaveUndefinedDefaults(params) {
        if (!Array.isArray(params) || params.length === 0) {
            return false;
        }

        let changed = false;
        // Materialize identifier parameters that come after (to the right of)
        // any explicit, non-`undefined` default. Scan left-to-right and
        // remember when we've encountered a concrete default so subsequent
        // identifiers can be converted into DefaultParameter nodes with an
        // `undefined` right. Be conservative: only treat AssignmentPattern
        // or DefaultParameter nodes with a non-`undefined` RHS as an
        // explicit default to the left.
        let seenExplicitDefaultToLeft = false;
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
                // If a prior transform already produced a DefaultParameter
                // but left the `right` slot null, do NOT eagerly materialize
                // it here. Leaving it null allows subsequent argument_count
                // fallback matchers (below) to fill the RHS with a concrete
                // fallback expression when one is present in the function
                // body. Only treat an existing DefaultParameter as an
                // explicit default to the left if its RHS exists and is not
                // the `undefined` sentinel. This prevents synthetic or
                // materialized undefined placeholders from causing trailing
                // parameters to be implicitly materialized as optional.
                try {
                    if (param.right != null) {
                        const isUndef = Core.isUndefinedSentinel(param.right);
                        if (!isUndef) {
                            seenExplicitDefaultToLeft = true;
                        }
                    }
                } catch {
                    // ignore helper failures and err on the conservative side
                }

                continue;
            }

            // Treat source-level assignment patterns (e.g. `param = 1`) as an
            // explicit default to the left so trailing bare identifiers are
            // materialized. Do not mutate AssignmentPattern nodes themselves;
            // just record that we've seen a default to the left.
            if (param.type === "AssignmentPattern") {
                // A true assignment pattern (e.g. `x = 1`) is an explicit
                // default and should count as an explicit default to the
                // left for materialization purposes.
                seenExplicitDefaultToLeft = true;
                continue;
            }

            // If we've already encountered a DefaultParameter to the left
            // then bare identifiers to the right should be treated as
            // implicitly optional and materialized with an explicit
            // `undefined` initializer.
            if (param.type === "Identifier") {
                if (seenExplicitDefaultToLeft) {
                    // Materialize trailing identifiers to a DefaultParameter
                    // shape with an `undefined` RHS so downstream phases see
                    // a consistent node form. These materialized parameters
                    // are the result of an explicit source-level default to
                    // the left, so mark them as optional by default to
                    // preserve historical semantics and make downstream
                    // doc/printer behavior deterministic.
                    const defaultParam = {
                        type: "DefaultParameter",
                        left: param,
                        // Materialize the undefined sentinel as a Literal so
                        // downstream passes (and tests) observe the
                        // historical `value: "undefined"` shape.
                        right: { type: "Literal", value: "undefined" },
                        // Mark materialized trailing undefined defaults so
                        // tests and downstream passes can observe that the
                        // node was synthesized by this transform. Record a
                        // dedicated flag that indicates this materialization
                        // originated from an explicit source-level default
                        // to the left. This distinguishes explicit-left
                        // materialization from argument_count-style
                        // materialization performed later in this file.
                        _featherMaterializedTrailingUndefined: true,
                        _featherMaterializedFromExplicitLeft: true
                    };

                    // Do NOT set `_featherOptionalParameter` here. Leave the
                    // explicit optionality decision to the later
                    // doc-driven reconciliation so plain functions omit
                    // redundant `= undefined` unless docs indicate optional.
                    params[i] = defaultParam;
                    changed = true;
                }

                // If we haven't yet seen an explicit default to the left,
                // this identifier remains required; continue scanning.
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
    function reconcileDocOptionality() {
        try {
            try {
                console.warn(
                    `[feather:diagnostic] reconcile: entering fn=${node && node.id && node.id.name ? node.id.name : "<anon>"} params=${Array.isArray(node.params) ? node.params.length : "na"}`
                );
            } catch {
                /* swallow */
            }
            // Snapshot params before calling into doc manager (which may throw
            // in edge cases). This helps us diagnose whether the materialized
            // flags exist before further processing.
            try {
                const snap = Core.toMutableArray(node.params || []);
                const lines = snap.map((pp, ii) => {
                    const left =
                        pp && pp.left && pp.left.name
                            ? pp.left.name
                            : pp && pp.name
                              ? pp.name
                              : "<anon>";
                    return `${ii}:${pp && pp.type} left=${left} optional=${pp && pp._featherOptionalParameter} matTrailing=${pp && pp._featherMaterializedTrailingUndefined} matFromLeft=${pp && pp._featherMaterializedFromExplicitLeft}`;
                });
                console.warn(
                    `[feather:diagnostic] reconcile: pre-doc-manager params-snapshot=${lines.join("|")}`
                );
            } catch {
                /* swallow */
            }

            const docManager = Core.prepareDocCommentEnvironment(ast);
            const comments = docManager.getComments(node);
            try {
                // Diagnostic: print per-param flag summary at reconcile start
                const snap = Core.toMutableArray(node.params);
                const lines = snap.map((pp, ii) => {
                    const left =
                        pp && pp.left && pp.left.name
                            ? pp.left.name
                            : pp && pp.name
                              ? pp.name
                              : "<anon>";
                    return `${ii}:${pp && pp.type} left=${left} optional=${pp && pp._featherOptionalParameter} matTrailing=${pp && pp._featherMaterializedTrailingUndefined} matFromLeft=${pp && pp._featherMaterializedFromExplicitLeft}`;
                });
                console.warn(
                    `[feather:diagnostic] reconcile: params-snapshot=${lines.join("|")}`
                );
            } catch {
                /* swallow */
            }
            const paramDocMap = new Map();
            if (Array.isArray(comments) && comments.length > 0) {
                for (const comment of comments) {
                    if (!comment || typeof comment.value !== "string") continue;
                    const m = comment.value.match(
                        /@param\s*(?:\{[^}]*\}\s*)?(\[[^\]]+\]|\S+)/i
                    );
                    if (!m) continue;
                    const raw = m[1];
                    const name = raw
                        ? raw.replaceAll(/^\[|\]$/g, "").trim()
                        : null;
                    const isOptional = raw ? /^\[.*\]$/.test(raw) : false;
                    if (name) {
                        paramDocMap.set(name, isOptional);
                    }
                }
            }

            // Walk parameters and set the flag where the RHS is an `undefined`
            // sentinel. Constructors prefer to preserve optional syntax by
            // default; plain functions omit unless the doc indicates optional.
            const params = Core.toMutableArray(node.params);
            for (const p of params) {
                try {
                    const lname =
                        p && p.left && p.left.name
                            ? p.left.name
                            : p && p.name
                              ? p.name
                              : "<anon>";
                    console.warn(
                        `[feather:diagnostic] reconcile: iter-param left=${lname} type=${p && p.type} matFromLeft=${p && p._featherMaterializedFromExplicitLeft} matTrailing=${p && p._featherMaterializedTrailingUndefined}`
                    );
                } catch {
                    /* swallow */
                }
                if (!p) continue;

                // Handle both DefaultParameter and AssignmentPattern shapes.
                let leftName = null;
                let rightNode = null;
                if (p.type === "DefaultParameter") {
                    leftName =
                        p.left && p.left.type === "Identifier"
                            ? p.left.name
                            : null;
                    rightNode = p.right;
                } else if (p.type === "AssignmentPattern") {
                    leftName =
                        p.left && p.left.type === "Identifier"
                            ? p.left.name
                            : null;
                    rightNode = p.right;
                } else {
                    continue;
                }

                // Use the helper so we correctly detect the parser's undefined
                // sentinel regardless of the exact node shape (Identifier vs
                // Literal placeholder passed through by upstream transforms).
                const isUndefined = Core.isUndefinedSentinel(rightNode);
                if (!isUndefined) continue;

                // If doc explicitly marks optional, respect that and override any
                // parser-provided intent. Otherwise, prefer an existing parser
                // annotation (from earlier canonicalization) and only fall back to
                // the conservative defaults below when no parser or doc guidance
                // exists. This avoids accidentally discarding parser-intended
                // optional markers produced by earlier transforms.
                if (leftName && paramDocMap.has(leftName)) {
                    try {
                        p._featherOptionalParameter =
                            paramDocMap.get(leftName) === true;
                    } catch {
                        // Swallow errors
                    }
                    continue;
                }

                // If a prior transform already annotated this parameter with a
                // concrete intent, preserve that intent rather than overwriting
                // it here. Doc comments may explicitly override above.
                try {
                    if (
                        p._featherOptionalParameter === true ||
                        p._featherOptionalParameter === false
                    ) {
                        continue;
                    }
                } catch {
                    // Swallow errors
                }

                // If this parameter was materialized by an earlier pass as a
                // trailing `undefined` default, prefer to mark it explicitly as
                // optional so downstream printer logic can decide whether to
                // omit or emit the `= undefined` signature. Preserve any
                // existing explicit annotations above first.
                try {
                    // If this parameter was materialized from an explicit
                    // left-side default (e.g. `a, b = 1, c` -> `c = undefined`)
                    // treat it as intentionally optional by default so that
                    // downstream consumers preserve the historical behaviour
                    // expected by the plugin tests. Materializations that
                    // originate from other sources (in-body argument_count
                    // fallbacks) remain conservative unless docs or earlier
                    // transforms indicate optionality.
                    if (p._featherMaterializedFromExplicitLeft === true) {
                        // Only treat materializations as intentionally optional
                        // when there exists a concrete, non-materialized explicit
                        // default to the left. This prevents marking parameters
                        // optional when the "materialized from explicit left"
                        // flag was set due to earlier conservative passes where
                        // the left-side default itself was synthesized.
                        try {
                            const paramsList = Core.toMutableArray(node.params);
                            const idx = paramsList.indexOf(p);
                            let foundRealExplicitToLeft = false;
                            try {
                                // Diagnostic: show params list identities and the index we found
                                try {
                                    const summary = Array.isArray(paramsList)
                                        ? paramsList
                                              .map(
                                                  (x, ii) =>
                                                      `${ii}:${x && x.type}${x && x.left && x.left.name ? `(${x.left.name})` : ""}`
                                              )
                                              .join(",")
                                        : String(paramsList);
                                    console.warn(
                                        `[feather:diagnostic] reconcile: paramsListSummary=${summary} idx=${idx}`
                                    );
                                } catch {
                                    /* swallow */
                                }
                            } catch {
                                /* swallow */
                            }
                            if (idx > 0) {
                                for (let k = 0; k < idx; k += 1) {
                                    const leftParam = paramsList[k];
                                    if (!leftParam) continue;
                                    if (
                                        leftParam.type === "DefaultParameter" &&
                                        leftParam.right != null
                                    ) {
                                        // If the left param was itself materialized as
                                        // a trailing undefined, prefer not to treat it
                                        // as a real explicit default.
                                        if (
                                            leftParam._featherMaterializedTrailingUndefined
                                        ) {
                                            continue;
                                        }
                                        // If the RHS is a non-undefined literal/expression
                                        // treat this as a true explicit default.
                                        const isUndef =
                                            Core.isUndefinedSentinel(
                                                leftParam.right
                                            );
                                        if (!isUndef) {
                                            foundRealExplicitToLeft = true;
                                            break;
                                        }
                                    }
                                    if (
                                        leftParam.type === "AssignmentPattern"
                                    ) {
                                        // Assignment patterns are source-level defaults
                                        // and count as a real explicit default.
                                        foundRealExplicitToLeft = true;
                                        break;
                                    }
                                }
                            }

                            if (foundRealExplicitToLeft) {
                                try {
                                    // Diagnostic: log why we're marking optional
                                    console.warn(
                                        `[feather:diagnostic] reconcile: marking-optional idx=${idx} param=${leftName || (p && p.left && p.left.name)} foundRealExplicitToLeft=${foundRealExplicitToLeft}`
                                    );
                                } catch {
                                    /* swallow */
                                }
                                p._featherOptionalParameter = true;
                                continue;
                            }
                        } catch {
                            // swallow errors and fall through to conservative behavior
                        }
                    }

                    if (p._featherMaterializedTrailingUndefined === true) {
                        // Materialized trailing undefined defaults that did NOT
                        // originate from an explicit left-side default are
                        // treated conservatively (required) unless docs or the
                        // parser explicitly mark them optional.
                        p._featherOptionalParameter = false;
                        continue;
                    }
                } catch {
                    // Swallow errors
                }

                // Constructors keep optional syntax by default when the signature
                // contains explicit undefined defaults.
                if (node.type === "ConstructorDeclaration") {
                    try {
                        p._featherOptionalParameter = true;
                    } catch {
                        // Swallow errors
                    }
                    continue;
                }

                // Otherwise plain function declarations should omit redundant
                // `= undefined` signatures unless parser transforms explicitly
                // intended them to be optional.
                try {
                    p._featherOptionalParameter = false;
                } catch {
                    // Swallow errors
                }
            }
        } catch {
            // Swallow errors
        }
    }

    // Run reconciliation early to pick up explicit doc overrides that apply
    // to any materialized placeholders produced so far. We'll run it again
    // after finalization to honor flags created later in the transform.
    try {
        reconcileDocOptionality();
    } catch {
        // swallow
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

    function matchArgumentCountFallbackStatement(statement) {
        if (!statement) {
            return null;
        }

        // Match `if (argument_count < 2) argument2 = ...;` style guards and
        // `if (argument_count == 0) { argument0 = ... }` forms.
        if (statement.type === "IfStatement") {
            const condition = Core.unwrapParenthesizedExpression(
                statement.test
            );
            const result = matchArgumentCountGuard(condition);
            if (!result) {
                return null;
            }

            const argumentIndex = result.argumentIndex;

            // Normalize both branches (consequent and alternate) into
            // statement lists so we can detect patterns that put the
            // argument projection in one branch and the fallback in the
            // other. We want to accept both `if (cond) proj; else fallback;`
            // and the inverted forms.
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
                const match = matchAssignmentToArgumentIndex(
                    stmt,
                    argumentIndex
                );
                if (!match) continue;
                if (match.argumentExpression && !foundArgMatch) {
                    foundArgMatch = match;
                }
                if (match.fallbackExpression && !foundFallbackMatch) {
                    foundFallbackMatch = match;
                }
            }

            for (const stmt of alternateStatements) {
                const match = matchAssignmentToArgumentIndex(
                    stmt,
                    argumentIndex
                );
                if (!match) continue;
                if (match.argumentExpression && !foundArgMatch) {
                    foundArgMatch = match;
                }
                if (match.fallbackExpression && !foundFallbackMatch) {
                    foundFallbackMatch = match;
                }
            }

            if (foundArgMatch || foundFallbackMatch) {
                try {
                    // Diagnostic: report when we detect a match for an
                    // argument_count fallback so we can confirm detection.

                    console.warn(
                        `[feather:diagnostic] match detected argumentIndex=${argumentIndex} argMatch=${!!foundArgMatch} fallbackMatch=${!!foundFallbackMatch}`
                    );
                } catch {
                    // swallow
                }
                return {
                    argumentIndex,
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
            const single = Core.getSingleMemberIndexPropertyEntry(right);
            if (single) {
                const indexText = Core.getIdentifierText(single);
                const indexNumber = Number(indexText);
                if (
                    !Number.isNaN(indexNumber) &&
                    indexNumber === argumentIndex
                ) {
                    // If the LHS is a local identifier, expose it as the
                    // targetName so callers can map this projection back
                    // to a parameter with the same name.
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

        // Pattern A: assignment writes into an `argumentN` target
        // (e.g. `argument0 = foo;`) or into a local identifier
        // (e.g. `arg = foo;`). When the left-hand side is a plain
        // identifier that is NOT an `argumentN` target, treat that
        // identifier as the projected parameter name (`targetName`) so
        // downstream logic can match it against declared parameters.
        if (left.type === "Identifier") {
            const name = Core.getIdentifierText(left);
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

        // Accept argument_count on either side of the binary expression.
        // If it's on the right, normalize the operator so we can reuse the
        // same mapping logic as when the subject is on the left.
        const leftIsSubject = !!resolveNodeToArgumentCountSubject(left);
        const rightIsSubject = !!resolveNodeToArgumentCountSubject(right);

        if (!leftIsSubject && !rightIsSubject) return null;

        // Determine which side contains the numeric bound and normalize the
        // operator if necessary so we always treat the subject as the left
        // operand for the subsequent mapping.
        let numericNode;
        let normalizedOperator = operator;
        if (leftIsSubject) {
            numericNode = right;
        } else {
            // argument_count is on the right; invert the operator so we can
            // apply the same mapping as the left-subject case.
            numericNode = left;
            const invert = {
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

        // Robustly extract a numeric bound from the numericNode. Some
        // parsers produce a Literal node for the numeric bound while
        // others use an Identifier-like node. Try literal first then
        // fall back to the helper extraction.
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

    function resolveNodeToArgumentCountSubject(node) {
        try {
            const text = Core.getIdentifierText(node);
            if (
                typeof text === "string" &&
                text.toLowerCase() === "argument_count"
            ) {
                return text;
            }

            // Accept member access forms like `some.object.argument_count` or
            // index-based access `some.object["argument_count"]` where the
            // ultimate property name is `argument_count`.
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

    function getIdentifierFromParameter(param) {
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
    function collectImplicitArgumentReferences(functionNode) {
        if (!functionNode || functionNode.type !== "FunctionDeclaration") {
            return [];
        }

        const referencedIndices = new Set<number>();
        const aliasByIndex = new Map<number, string>();
        const directReferenceIndices = new Set<number>();

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
                    const aliasName =
                        node.id.name && String(node.id.name).trim();
                    if (aliasName && aliasName.length > 0) {
                        aliasByIndex.set(aliasIndex, aliasName);
                        referencedIndices.add(aliasIndex);
                    }
                }
            }

            const directIndex = getArgumentIndexFromNode(node);
            if (directIndex !== null) {
                referencedIndices.add(directIndex);
                // By default we consider direct occurrences of `argumentN`
                // to be explicit references. However, when the occurrence is
                // the initializer of a VariableDeclarator that we just
                // recorded as an alias (e.g. `var two = argument2;`), treat
                // that occurrence as an alias initializer only and do NOT
                // count it as a direct reference. Tests expect alias
                // initializers to allow the alias to supersede the
                // fallback `argumentN` doc line, so avoid marking those
                // initializers as direct references here. For all other
                // contexts, record the direct reference normally.
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
                (typeof fallbackName === "string" &&
                    fallbackName.toLowerCase()) ||
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
        const parsed = Number.parseInt(match[1]);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }
}
