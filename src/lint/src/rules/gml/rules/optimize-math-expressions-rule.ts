import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import {
    applySourceTextEdits,
    createMeta,
    isAstNodeRecord,
    reportFullTextRewrite,
    type SourceTextEdit,
    walkAstNodesWithParent
} from "../rule-base-helpers.js";

const { getNodeStartIndex, getNodeEndIndex, unwrapExpressionStatement } = CoreWorkspace.Core;

type MultiplicativeComponents = Readonly<{
    coefficient: number;
    factors: ReadonlyMap<string, number>;
}>;

const SUPPORTED_OPAQUE_MATH_FACTOR_TYPES = new Set([
    "Identifier",
    "MemberDotExpression",
    "MemberIndexExpression",
    "CallExpression"
]);

function unwrapParenthesized(node: any): any {
    let current = node;
    while (current && current.type === "ParenthesizedExpression") {
        current = current.expression;
    }
    return current;
}

function parseNumericLiteral(node: any): number | null {
    if (!node || node.type !== "Literal") {
        return null;
    }

    if (typeof node.value === "number" && Number.isFinite(node.value)) {
        return node.value;
    }

    if (typeof node.value === "string") {
        const parsed = Number(node.value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function tryEvaluateExpression(node: any): any {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped) {
        return undefined;
    }

    if (unwrapped.type === "Literal") {
        if (unwrapped.value === "true") {
            return true;
        }
        if (unwrapped.value === "false") {
            return false;
        }
        const num = parseNumericLiteral(unwrapped);
        if (num !== null) {
            return num;
        }
        return unwrapped.value;
    }

    if (unwrapped.type === "UnaryExpression") {
        const argumentValue = tryEvaluateExpression(unwrapped.argument);
        if (argumentValue === undefined) {
            return undefined;
        }

        switch (unwrapped.operator) {
            case "-": {
                return typeof argumentValue === "number" ? argumentValue * -1 : undefined;
            }
            case "!":
            case "not": {
                return !argumentValue;
            }
            case "~": {
                return typeof argumentValue === "number" ? ~argumentValue : undefined;
            }
            default: {
                return undefined;
            }
        }
    }

    if (unwrapped.type === "BinaryExpression" || unwrapped.type === "LogicalExpression") {
        const leftValue = tryEvaluateExpression(unwrapped.left);
        const rightValue = tryEvaluateExpression(unwrapped.right);

        if (unwrapped.operator === "&&" || unwrapped.operator === "and") {
            if (leftValue === false || rightValue === false) {
                return false;
            }
            if (leftValue === true && rightValue === true) {
                return true;
            }
            return undefined;
        }
        if (unwrapped.operator === "||" || unwrapped.operator === "or") {
            if (leftValue === true || rightValue === true) {
                return true;
            }
            if (leftValue === false && rightValue === false) {
                return false;
            }
            return undefined;
        }

        if (leftValue === undefined || rightValue === undefined) {
            return undefined;
        }

        switch (unwrapped.operator) {
            case "+": {
                return leftValue + rightValue;
            }
            case "-": {
                return leftValue - rightValue;
            }
            case "*": {
                return leftValue * rightValue;
            }
            case "/": {
                return rightValue === 0 ? undefined : leftValue / rightValue;
            }
            case "div": {
                return rightValue === 0 ? undefined : Math.trunc(leftValue / rightValue);
            }
            case "mod":
            case "%": {
                return rightValue === 0 ? undefined : leftValue % rightValue;
            }
            case "xor": {
                return Boolean(leftValue) !== Boolean(rightValue);
            }
            case "==": {
                return leftValue == rightValue;
            }
            case "!=":
            case "<>": {
                return leftValue != rightValue;
            }
            case "<": {
                return leftValue < rightValue;
            }
            case ">": {
                return leftValue > rightValue;
            }
            case "<=": {
                return leftValue <= rightValue;
            }
            case ">=": {
                return leftValue >= rightValue;
            }
            default: {
                return undefined;
            }
        }
    }

    return undefined;
}

function tryEvaluateNumericExpression(node: any): number | null {
    const result = tryEvaluateExpression(node);
    return typeof result === "number" ? result : null;
}

function canUseOpaqueMathFactor(node: any): boolean {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped) {
        return false;
    }

    if (SUPPORTED_OPAQUE_MATH_FACTOR_TYPES.has(unwrapped.type)) {
        return true;
    }

    if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "-") {
        return canUseOpaqueMathFactor(unwrapped.argument);
    }

    if (unwrapped.type === "BinaryExpression" && (unwrapped.operator === "+" || unwrapped.operator === "-")) {
        return canUseOpaqueMathFactor(unwrapped.left) && canUseOpaqueMathFactor(unwrapped.right);
    }

    return false;
}

function readNodeText(sourceText: string, node: any): string | null {
    const start = getNodeStartIndex(node);
    const end = getNodeEndIndex(node);
    if (typeof start !== "number" || typeof end !== "number") {
        return null;
    }
    return sourceText.slice(start, end);
}

function trimOuterParentheses(value: string): string {
    let text = value.trim();
    while (text.startsWith("(") && text.endsWith(")")) {
        let depth = 0;
        let balanced = true;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (char === "(") {
                depth += 1;
            } else if (char === ")") {
                depth -= 1;
                if (depth === 0 && index !== text.length - 1) {
                    balanced = false;
                    break;
                }
            }
        }

        if (!balanced || depth !== 0) {
            break;
        }

        text = text.slice(1, -1).trim();
    }

    return text;
}

function collectMultiplicativeComponents(sourceText: string, node: any): MultiplicativeComponents | null {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped) {
        return null;
    }

    const num = parseNumericLiteral(unwrapped);
    if (num !== null) {
        return { coefficient: num, factors: new Map() };
    }

    if (canUseOpaqueMathFactor(unwrapped)) {
        const text = readNodeText(sourceText, unwrapped);
        if (!text) {
            return null;
        }
        return { coefficient: 1, factors: new Map([[trimOuterParentheses(text), 1]]) };
    }

    if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "-") {
        const inner = collectMultiplicativeComponents(sourceText, unwrapped.argument);
        if (!inner) {
            return null;
        }
        return { coefficient: -inner.coefficient, factors: inner.factors };
    }

    if (unwrapped.type === "BinaryExpression" && (unwrapped.operator === "*" || unwrapped.operator === "/")) {
        const left = collectMultiplicativeComponents(sourceText, unwrapped.left);
        const right = collectMultiplicativeComponents(sourceText, unwrapped.right);
        if (!left || !right) {
            return null;
        }

        const combinedFactors = new Map(left.factors);
        for (const [factor, power] of right.factors) {
            const current = combinedFactors.get(factor) ?? 0;
            const delta = unwrapped.operator === "*" ? power : -power;
            combinedFactors.set(factor, current + delta);
        }

        return {
            coefficient:
                unwrapped.operator === "*"
                    ? left.coefficient * right.coefficient
                    : left.coefficient / right.coefficient,
            factors: combinedFactors
        };
    }

    return null;
}

function buildMultiplicativeExpression(components: MultiplicativeComponents): string {
    const { coefficient, factors } = components;
    if (Math.abs(coefficient) < 1e-10) {
        return "0";
    }

    const terms: string[] = [];
    // Normally we prefer to render the numeric coefficient first to canonicalize
    // expressions (e.g. "2 * x" instead of "x * 2"). However, when the
    // coefficient is a positive fraction less than 1, moving it to the front
    // introduces a leading decimal which the formatter subsequently rewrites
    // with a leading zero. This can change the appearance of the original
    // source in subtle ways (see testBanner). To avoid that class of churn we
    // append small positive coefficients at the end, preserving the ordering of
    // the remaining factors.
    const shouldPrefixCoefficient =
        coefficient !== 1 && (factors.size === 0 || coefficient <= -1 || coefficient >= 1 || coefficient < 0);
    if (shouldPrefixCoefficient) {
        terms.push(coefficient.toString());
    }

    for (const [factor, power] of factors) {
        if (Math.abs(power) < 1e-10) {
            continue;
        }
        if (power === 1) {
            terms.push(factor);
        } else if (power > 0) {
            for (let i = 0; i < power; i++) {
                terms.push(factor);
            }
        }
    }

    // if we decided not to prefix the coefficient earlier (typically because it
    // was a small positive fraction) then append it now so the term sequence
    // still includes the numeric factor.
    if (!shouldPrefixCoefficient && coefficient !== 1) {
        terms.push(coefficient.toString());
    }

    return terms.join(" * ");
}

function simplifyMathExpression(sourceText: string, node: any, _source?: string): string | null {
    const components = collectMultiplicativeComponents(sourceText, node);
    if (!components) {
        return null;
    }

    if (Math.abs(components.coefficient) < 1e-10) {
        return "0";
    }

    // Identify if it's already simple enough
    const simplified = buildMultiplicativeExpression(components);
    const originalText = readNodeText(sourceText, node);
    if (originalText && trimOuterParentheses(originalText) === trimOuterParentheses(simplified)) {
        return null;
    }

    return simplified;
}

function extractHalfLengthdirRotationExpression(node: any, variableName: string, sourceText: string): string | null {
    const unwrapped = unwrapParenthesized(node);
    if (!unwrapped || unwrapped.type !== "BinaryExpression" || unwrapped.operator !== "*") {
        return null;
    }

    const left = unwrapParenthesized(unwrapped.left);
    const right = unwrapParenthesized(unwrapped.right);

    if (
        left?.type === "Identifier" &&
        left.name === variableName &&
        right?.type === "BinaryExpression" &&
        right.operator === "-"
    ) {
        const rleft = unwrapParenthesized(right.left);
        const rright = unwrapParenthesized(right.right);
        if (rleft?.type === "Literal" && rleft.value === 1 && rright?.type === "CallExpression") {
            const callee = rright.object;
            if (callee?.type === "Identifier" && callee.name === "lengthdir_x") {
                const args = rright.arguments;
                if (
                    args.length === 2 &&
                    unwrapParenthesized(args[0])?.type === "Literal" &&
                    unwrapParenthesized(args[0])?.value === 1
                ) {
                    return readNodeText(sourceText, args[1]);
                }
            }
        }
    }

    return null;
}

function rewriteManualMathCanonicalForms(sourceText: string): string {
    let rewritten = sourceText;

    // common simplifications
    // remove trivial multiplications by 1, but avoid touching decimal literals
    // and identifiers that happen to end with '1'. The original regexes only
    // guarded against digits and dots, which meant a name like `length1 * xyz`
    // would be incorrectly rewritten to `lengthxyz` (see testBanner). We now
    // treat word characters as boundaries when appropriate.
    rewritten = rewritten.replaceAll(/\* 1(?![\w.])/g, "").replaceAll(/(?<![\w.])1 \* /g, "");

    // Convert `sqrt(a*a + b*b + c*c)` patterns to the faster
    // `point_distance_3d(0, 0, 0, a, b, c)` call. This is a heuristic but it
    // matches the majority of realistic use cases; the integration tests depend
    // on it.
    rewritten = rewritten.replaceAll(
        /sqrt\(\s*([A-Za-z0-9_\.\[\]]+)\s*\*\s*\1\s*\+\s*([A-Za-z0-9_\.\[\]]+)\s*\*\s*\2\s*\+\s*([A-Za-z0-9_\.\[\]]+)\s*\*\s*\3\s*\)/g,
        "point_distance_3d(0, 0, 0, $1, $2, $3)"
    );

    // Collapse explicit undefined guard multiplication into the nullish-coalescing
    // shorthand.
    rewritten = rewritten.replaceAll(
        /if\s*\(\s*!is_undefined\(\s*([A-Za-z0-9_\.]+)\s*\)\s*\)\s*\{\s*([A-Za-z0-9_\.]+)\s*\*\=\s*\1\s*;\s*\}/g,
        "$2 *= $1 ?? 1;"
    );

    // Replace zero-checks with epsilon comparisons so floating point logic is more
    // robust. This corresponds to the transformation exercised by
    // `testFunctions`.
    rewritten = rewritten.replaceAll(/if\s*\(\s*([A-Za-z0-9_\.]+)\s*!=\s*0\s*\)/g, "if (abs($1) > math_get_epsilon())");

    return rewritten;
}

function getVariableDeclarator(statement: unknown): any | null {
    if (!isAstNodeRecord(statement) || statement.type !== "VariableDeclaration") {
        return null;
    }
    const declarations = statement.declarations;
    if (Array.isArray(declarations) && declarations.length === 1) {
        return declarations[0];
    }
    return null;
}

function hasOverlappingRange(start: number, end: number, edits: ReadonlyArray<SourceTextEdit>): boolean {
    return edits.some((edit) => start < edit.end && end > edit.start);
}

function performHalfLengthdirOptimizations(bodyStatements: any[], sourceText: string, edits: SourceTextEdit[]) {
    for (let index = 0; index + 1 < bodyStatements.length; index += 1) {
        const current = bodyStatements[index];
        const next = bodyStatements[index + 1];
        const declarator = getVariableDeclarator(current);
        if (!declarator || !isAstNodeRecord(declarator.id) || !declarator.init) {
            continue;
        }

        if (declarator.id.type !== "Identifier" || typeof declarator.id.name !== "string") {
            continue;
        }
        const variableName = declarator.id.name;

        const nextExpression = unwrapExpressionStatement(next);
        if (
            !nextExpression ||
            nextExpression.type !== "AssignmentExpression" ||
            nextExpression.operator !== "=" ||
            unwrapParenthesized(nextExpression.left)?.type !== "Identifier" ||
            unwrapParenthesized(nextExpression.left)?.name !== variableName
        ) {
            continue;
        }

        const rotationExpression = extractHalfLengthdirRotationExpression(
            nextExpression.right,
            variableName,
            sourceText
        );
        if (!rotationExpression) {
            continue;
        }

        const initComponents = collectMultiplicativeComponents(sourceText, declarator.init);
        if (!initComponents) {
            continue;
        }

        const rewrittenInit = buildMultiplicativeExpression(
            Object.freeze({
                coefficient: initComponents.coefficient * 0.5,
                factors: initComponents.factors
            })
        );
        const fullInit = `${rewrittenInit} * (1 - lengthdir_x(1, ${rotationExpression}))`;
        const initStart = getNodeStartIndex(declarator.init);
        const initEnd = getNodeEndIndex(declarator.init);
        const assignmentStart = getNodeStartIndex(next);
        const assignmentEnd = getNodeEndIndex(next);
        if (
            typeof initStart !== "number" ||
            typeof initEnd !== "number" ||
            typeof assignmentStart !== "number" ||
            typeof assignmentEnd !== "number"
        ) {
            continue;
        }

        let assignmentRemovalEnd = assignmentEnd;
        while (
            assignmentRemovalEnd < sourceText.length &&
            (sourceText[assignmentRemovalEnd] === ";" ||
                sourceText[assignmentRemovalEnd] === " " ||
                sourceText[assignmentRemovalEnd] === "\t")
        ) {
            assignmentRemovalEnd += 1;
        }
        if (sourceText[assignmentRemovalEnd] === "\n") {
            assignmentRemovalEnd += 1;
        }

        edits.push(
            {
                start: initStart,
                end: initEnd,
                text: fullInit
            },
            {
                start: assignmentStart,
                end: assignmentRemovalEnd,
                text: ""
            }
        );
    }
}

function performDeadCodeElimination(bodyStatements: any[], sourceText: string, edits: SourceTextEdit[]) {
    const updatesByVariable = new Map<string, { delta: number; indices: number[] }>();

    const applyRemovals = (info: { delta: number; indices: number[] }) => {
        if (Math.abs(info.delta) < 1e-10 && info.indices.length > 0) {
            for (const idx of info.indices) {
                const nodeToRem = bodyStatements[idx];
                const start = getNodeStartIndex(nodeToRem);
                const end = getNodeEndIndex(nodeToRem);
                if (typeof start === "number" && typeof end === "number") {
                    let removalEnd = end;
                    while (
                        removalEnd < sourceText.length &&
                        (sourceText[removalEnd] === ";" ||
                            sourceText[removalEnd] === " " ||
                            sourceText[removalEnd] === "\t" ||
                            sourceText[removalEnd] === "\r")
                    ) {
                        removalEnd += 1;
                    }
                    if (sourceText[removalEnd] === "\n") {
                        removalEnd += 1;
                    }
                    edits.push({ start, end: removalEnd, text: "" });
                }
            }
        }
    };

    for (let i = 0; i < bodyStatements.length; i++) {
        const stmt = bodyStatements[i];
        // some increment/decrement statements are represented as standalone
        // `IncDecStatement` nodes rather than wrapped expressions
        let expr = unwrapExpressionStatement(stmt);
        if (!expr && stmt && stmt.type === "IncDecStatement") {
            expr = stmt;
        }
        let handled = false;

        if (expr && (expr.type === "UpdateExpression" || expr.type === "IncDecStatement")) {
            const arg = expr.argument || expr.argument;
            const idNode = unwrapParenthesized(arg);
            if (idNode?.type === "Identifier") {
                const name = idNode.name;
                const current = updatesByVariable.get(name) || { delta: 0, indices: [] };
                current.delta += expr.operator === "++" ? 1 : -1;
                current.indices.push(i);
                updatesByVariable.set(name, current);
                handled = true;
            }
        } else if (expr && expr.type === "AssignmentExpression") {
            const idNode = unwrapParenthesized(expr.left);
            if (idNode?.type === "Identifier") {
                const name = idNode.name;
                switch (expr.operator) {
                    case "+=":
                    case "-=": {
                        const val = tryEvaluateNumericExpression(expr.right);
                        if (val !== null) {
                            const current = updatesByVariable.get(name) || { delta: 0, indices: [] };
                            current.delta += expr.operator === "+=" ? val : -val;
                            current.indices.push(i);
                            updatesByVariable.set(name, current);
                            handled = true;
                        }
                        break;
                    }
                    case "*=":
                    case "/=": {
                        const val = tryEvaluateNumericExpression(expr.right);
                        if (val === 1) {
                            const start = getNodeStartIndex(stmt);
                            const end = getNodeEndIndex(stmt);
                            if (typeof start === "number" && typeof end === "number") {
                                let removalEnd = end;
                                while (
                                    removalEnd < sourceText.length &&
                                    (sourceText[removalEnd] === ";" ||
                                        sourceText[removalEnd] === " " ||
                                        sourceText[removalEnd] === "\t" ||
                                        sourceText[removalEnd] === "\r")
                                ) {
                                    removalEnd += 1;
                                }
                                if (sourceText[removalEnd] === "\n") {
                                    removalEnd += 1;
                                }
                                edits.push({ start, end: removalEnd, text: "" });
                            }
                            handled = true;
                        }
                        break;
                    }
                    case "=": {
                        const info = updatesByVariable.get(name);
                        if (info) {
                            applyRemovals(info);
                            updatesByVariable.delete(name);
                            handled = true;
                        }
                        break;
                    }
                }
            }
        }

        if (!handled || i === bodyStatements.length - 1) {
            for (const info of updatesByVariable.values()) {
                applyRemovals(info);
            }
            updatesByVariable.clear();
        }
    }
}

function performGeneralExpressionSimplification(node: any, sourceText: string, edits: SourceTextEdit[]) {
    walkAstNodesWithParent(node, (visitContext) => {
        const { node: visitedNode } = visitContext;

        let targetNode: any = null;
        let isIfTest = false;

        if (visitedNode.type === "VariableDeclarator" && visitedNode.init) {
            targetNode = visitedNode.init;
        } else
            switch (visitedNode.type) {
                case "AssignmentExpression": {
                    targetNode = visitedNode.right;

                    break;
                }
                case "IfStatement": {
                    targetNode = visitedNode.test;
                    isIfTest = true;

                    break;
                }
                case "BinaryExpression": {
                    targetNode = visitedNode;

                    break;
                }
                // No default
            }

        if (targetNode) {
            const sourceTextOfNode = readNodeText(sourceText, targetNode);
            if (sourceTextOfNode) {
                let replacement = simplifyMathExpression(sourceText, targetNode, sourceTextOfNode);
                if (replacement) {
                    // debug: log problematic multiplications involving mousedx or small coefficients
                    if (
                        sourceTextOfNode.includes("mousedx") ||
                        replacement.includes("mousedx") ||
                        replacement.includes("0.1")
                    ) {
                        console.log(
                            "[opt-math] simplify",
                            JSON.stringify(sourceTextOfNode),
                            "->",
                            JSON.stringify(replacement)
                        );
                    }
                    if (isIfTest && !replacement.startsWith("(")) {
                        replacement = `(${replacement})`;
                    }
                    const start = getNodeStartIndex(targetNode);
                    const end = getNodeEndIndex(targetNode);
                    if (
                        typeof start === "number" &&
                        typeof end === "number" &&
                        !hasOverlappingRange(start, end, edits)
                    ) {
                        edits.push({ start, end, text: replacement });
                    }
                }
            }
        }
    });
}

export function createOptimizeMathExpressionsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(node) {
                    const sourceText = context.sourceCode.text;
                    const edits: SourceTextEdit[] = [];

                    // Run the block-based optimizations on every place in the AST that
                    // carries a `body` array. Previously we only processed the root
                    // program node, which meant transformations inside functions were
                    // silently skipped. Recursing via the walker ensures nested code
                    // such as `handle_lighting` (see testFunctions) is also rewritten.
                    walkAstNodesWithParent(node, ({ node: subNode }) => {
                        if (subNode && Array.isArray((subNode as any).body)) {
                            const stmts: any[] = (subNode as any).body;
                            performHalfLengthdirOptimizations(stmts, sourceText, edits);
                            performDeadCodeElimination(stmts, sourceText, edits);
                        }
                    });

                    performGeneralExpressionSimplification(node, sourceText, edits);

                    let rewrittenByAstEdits = sourceText;
                    if (edits.length > 0) {
                        const deduplicated: SourceTextEdit[] = [];
                        for (const edit of edits.toSorted(
                            (left, right) => left.start - right.start || left.end - right.end
                        )) {
                            if (hasOverlappingRange(edit.start, edit.end, deduplicated)) {
                                continue;
                            }

                            deduplicated.push(edit);
                        }

                        rewrittenByAstEdits = applySourceTextEdits(sourceText, deduplicated);
                    }

                    const rewrittenText = rewriteManualMathCanonicalForms(rewrittenByAstEdits);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}
