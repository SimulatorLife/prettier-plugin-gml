import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, reportFullTextRewrite } from "../rule-base-helpers.js";

function normalizeLogicalExpressionText(expressionText: string): string {
    return expressionText.trim().replaceAll(/\s+/g, " ");
}

function convertLogicalSymbolsToKeywords(expressionText: string): string {
    return normalizeLogicalExpressionText(expressionText).replaceAll("&&", "and").replaceAll("||", "or");
}

function trimOuterParentheses(text: string): string {
    let currentText = text.trim();
    while (currentText.startsWith("(") && currentText.endsWith(")")) {
        let balance = 0;
        let balanced = true;
        for (let i = 0; i < currentText.length - 1; i++) {
            if (currentText[i] === "(") {
                balance++;
            } else if (currentText[i] === ")") {
                balance--;
            }
            if (balance === 0) {
                balanced = false;
                break;
            }
        }
        if (balanced) {
            currentText = currentText.slice(1, -1).trim();
        } else {
            break;
        }
    }
    return currentText;
}

function wrapNegatedLogicalCondition(conditionText: string): string {
    const trimmed = conditionText.trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(trimmed) || trimmed.startsWith("!")) {
        return `!${trimmed}`;
    }

    return `!(${trimmed})`;
}

function simplifyLogicalConditionExpression(conditionText: string): string {
    const normalized = convertLogicalSymbolsToKeywords(trimOuterParentheses(conditionText));

    const absorptionOrMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+or\s+\(\1\s+and\s+[A-Za-z_][A-Za-z0-9_]*\)$/u.exec(
        normalized
    );
    if (absorptionOrMatch) {
        return absorptionOrMatch[1];
    }

    const absorptionAndMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+and\s+\(\1\s+or\s+[A-Za-z_][A-Za-z0-9_]*\)$/u.exec(
        normalized
    );
    if (absorptionAndMatch) {
        return absorptionAndMatch[1];
    }

    const sharedAndMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+\(\1\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)$/u.exec(
            normalized
        );
    if (sharedAndMatch) {
        return `${sharedAndMatch[1]} && (${sharedAndMatch[2]} || ${sharedAndMatch[3]})`;
    }

    const sharedOrMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+\(!\1\s+and\s+\2\)$/u.exec(normalized);
    if (sharedOrMatch) {
        return sharedOrMatch[2];
    }

    const xorMatch = /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+!([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+\(!\1\s+and\s+\2\)$/u.exec(
        normalized
    );
    if (xorMatch) {
        return `(${xorMatch[1]} || ${xorMatch[2]}) && !(${xorMatch[1]} && ${xorMatch[2]})`;
    }

    const guardExtractionMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+\2\)\s+or\s+\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+\2\)$/u.exec(
            normalized
        );
    if (guardExtractionMatch) {
        return `(${guardExtractionMatch[1]} || ${guardExtractionMatch[3]} || ${guardExtractionMatch[4]}) && ${guardExtractionMatch[2]}`;
    }

    const demorganAndMatch = /^!\(([A-Za-z_][A-Za-z0-9_]*)\s+or\s+([A-Za-z_][A-Za-z0-9_]*)\)$/u.exec(normalized);
    if (demorganAndMatch) {
        return `!${demorganAndMatch[1]} && !${demorganAndMatch[2]}`;
    }

    const demorganOrMatch = /^!\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)$/u.exec(normalized);
    if (demorganOrMatch) {
        return `!${demorganOrMatch[1]} || !${demorganOrMatch[2]}`;
    }

    const mixedReductionMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+or\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+and\s+\(!\1\s+or\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+and\s+\(!\2\s+or\s+\3\)$/u.exec(
            normalized
        );
    if (mixedReductionMatch) {
        return `!(${mixedReductionMatch[1]} && ${mixedReductionMatch[2]}) || ${mixedReductionMatch[3]}`;
    }

    return normalized;
}

function simplifyIfReturnExpression(conditionText: string, truthyText: string, falsyText: string): string | null {
    const truthy = normalizeLogicalExpressionText(truthyText);
    const falsy = normalizeLogicalExpressionText(falsyText);
    const simplifiedCondition = simplifyLogicalConditionExpression(conditionText);
    const normalizedCondition = convertLogicalSymbolsToKeywords(trimOuterParentheses(conditionText));

    if (truthy === "true" && falsy === "false") {
        return simplifiedCondition;
    }

    if (truthy === "false" && falsy === "true") {
        return wrapNegatedLogicalCondition(simplifiedCondition);
    }

    if (falsy === "true") {
        return `${wrapNegatedLogicalCondition(simplifiedCondition)} || ${truthy}`;
    }

    const branchCollapseMatch =
        /^\(([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\)\s+or\s+([A-Za-z_][A-Za-z0-9_]*)$/u.exec(
            normalizedCondition
        );
    if (branchCollapseMatch) {
        const [_, first, second, third] = branchCollapseMatch;
        if (truthy === `${first} and ${second}` && falsy === `${first} or ${third}`) {
            return `${first} && (!${third} || ${second})`;
        }
    }

    return `${simplifiedCondition} ? ${truthy} : ${falsy}`;
}

function rewriteLogicalFlowSource(sourceText: string): string {
    let rewritten = sourceText.replaceAll(/!!\s*([A-Za-z_][A-Za-z0-9_]*)/g, "$1");

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\((.+?)\)\s*\{\s*return\s+(.+?)\s*;[^}]*?\}\s*return\s+(.+?)\s*;/gm,
        (fullMatch, indentation: string, conditionText: string, truthyText: string, falsyText: string) => {
            const simplified = simplifyIfReturnExpression(conditionText, truthyText, falsyText);
            if (!simplified) {
                return fullMatch;
            }
            return `${indentation}return ${simplified};`;
        }
    );

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\((.+?)\)\s*\{\s*return\s+(.+?)\s*;[^}]*?\}\s*else\s*\{\s*return\s+(.+?)\s*;[^}]*?\}\s*$/gm,
        (fullMatch, indentation: string, conditionText: string, truthyText: string, falsyText: string) => {
            const simplified = simplifyIfReturnExpression(conditionText, truthyText, falsyText);
            if (!simplified) {
                return fullMatch;
            }
            return `${indentation}return ${simplified};`;
        }
    );

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\((.+?)\)\s*\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=\s*(.+?)\s*;\s*\}\s*else\s*\{\s*\3\s*=\s*(.+?)\s*;\s*\}\s*$/gm,
        (
            fullMatch,
            indentation: string,
            conditionText: string,
            assignmentTarget: string,
            truthyText: string,
            falsyText: string
        ) => {
            const simplifiedCondition = simplifyLogicalConditionExpression(conditionText);
            return `${indentation}${assignmentTarget} = ${simplifiedCondition} ? ${normalizeLogicalExpressionText(truthyText)} : ${normalizeLogicalExpressionText(falsyText)};`;
        }
    );

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\(\s*is_undefined\s*\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\)\s*\)([\s\S]*?)\{\s*\2\s*=\s*(.+?)\s*;\s*\}/gm,
        (_fullMatch, indentation: string, assignmentTarget: string, _spacing: string, fallbackText: string) =>
            `${indentation}${assignmentTarget} ??= ${normalizeLogicalExpressionText(fallbackText)};`
    );

    rewritten = rewritten.replaceAll(
        /^([ \t]*)if\s*\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*==\s*undefined\s*\)([\s\S]*?)\{\s*\2\s*=\s*(.+?)\s*;\s*\}/gm,
        (_fullMatch, indentation: string, assignmentTarget: string, _spacing: string, fallbackText: string) =>
            `${indentation}${assignmentTarget} ??= ${normalizeLogicalExpressionText(fallbackText)};`
    );

    return rewritten;
}

export function createOptimizeLogicalFlowRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const rewrittenText = rewriteLogicalFlowSource(sourceText);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}
