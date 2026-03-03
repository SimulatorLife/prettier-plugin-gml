import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";
import { dominantLineEnding } from "../rule-helpers.js";

type BracedSingleClause = Readonly<{
    indentation: string;
    header: string;
    statement: string;
}>;

type ControlFlowLineHeader = Readonly<{
    indentation: string;
    header: string;
}>;

function toBracedSingleClause(indentation: string, header: string, statement: string): Array<string> {
    return [`${indentation}${header} {`, `    ${indentation}${statement}`, `${indentation}}`];
}

function parseInlineControlFlowClause(line: string): BracedSingleClause | null {
    const match = /^([\t ]*)(if\s*\(.*?\))\s*(?!\{)(.+)$/u.exec(line);
    if (!match || match.length < 4 || match[3]?.trim() === "") {
        return null;
    }

    return Object.freeze({
        indentation: match[1] ?? "",
        header: match[2] ?? "",
        statement: match[3]?.trim() ?? ""
    });
}

function parseLineOnlyControlFlowHeader(line: string): ControlFlowLineHeader | null {
    const match = /^([\t ]*)((?:if|while|for|with)\s*\(.*?\))\s*$/u.exec(line);
    if (!match || match.length < 3) {
        return null;
    }

    return Object.freeze({
        indentation: match[1] ?? "",
        header: match[2] ?? ""
    });
}

function isSafeSingleLineControlFlowStatement(statement: string): boolean {
    const trimmed = statement.trim();
    if (trimmed === "" || trimmed.startsWith("{")) {
        return false;
    }

    if (
        trimmed.includes("if") ||
        trimmed.includes("while") ||
        trimmed.includes("for") ||
        trimmed.includes("with") ||
        trimmed.includes("do")
    ) {
        return false;
    }

    return true;
}

function parseInlineControlFlowClauseWithLegacyIf(line: string): BracedSingleClause | null {
    const match = /^([\t ]*)(if\b[^()]*\S)\s+(.+)$/u.exec(line);
    if (!match || match.length < 4 || match[3]?.trim() === "") {
        return null;
    }

    const header = match[2] ?? "";
    const statement = match[3]?.trim() ?? "";
    if (header.includes("(")) {
        return null;
    }
    if (statement.startsWith("{")) {
        return null;
    }

    return Object.freeze({
        indentation: match[1] ?? "",
        header,
        statement
    });
}

function parseInlineElseClause(line: string): BracedSingleClause | null {
    const match = /^([\t ]*)(else)\b\s*(?!\{)(?!if\b)(.+)$/u.exec(line);
    if (!match || match.length < 3 || match[2]?.trim() === "") {
        return null;
    }

    return Object.freeze({
        indentation: match[1] ?? "",
        header: "else",
        statement: match[2]?.trim() ?? ""
    });
}

function toBracedDoUntilClause(indentation: string, statement: string, untilCondition: string): Array<string> {
    return [`${indentation}do {`, `    ${indentation}${statement}`, `${indentation}} until ${untilCondition}`];
}

function parseLineOnlyDoHeader(line: string): string | null {
    const match = /^([\t ]*)do\s*$/u.exec(line);
    return match?.[1] ?? null;
}

function lineUsesMacroContinuation(line: string): boolean {
    return line.trimEnd().endsWith("\\");
}

function parseLineOnlyUntilFooter(line: string): string | null {
    const match = /^([\t ]*)until\s+(.+)$/u.exec(line);
    return match?.[2]?.trim() ?? null;
}

export function createRequireControlFlowBracesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
                    const rewrittenLines: Array<string> = [];
                    let inMacroContinuation = false;

                    for (let index = 0; index < lines.length; index += 1) {
                        const line = lines[index];

                        if (inMacroContinuation) {
                            rewrittenLines.push(line);
                            inMacroContinuation = lineUsesMacroContinuation(line);
                            continue;
                        }

                        if (/^\s*#macro\b/u.test(line)) {
                            rewrittenLines.push(line);
                            inMacroContinuation = lineUsesMacroContinuation(line);
                            continue;
                        }

                        const bracedConditionedClause = parseInlineControlFlowClause(line);
                        if (bracedConditionedClause) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(
                                    bracedConditionedClause.indentation,
                                    bracedConditionedClause.header,
                                    bracedConditionedClause.statement
                                )
                            );
                            continue;
                        }

                        const bracedElseClause = parseInlineElseClause(line);
                        if (bracedElseClause) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(
                                    bracedElseClause.indentation,
                                    bracedElseClause.header,
                                    bracedElseClause.statement
                                )
                            );
                            continue;
                        }

                        const bracedLegacyIfClause = parseInlineControlFlowClauseWithLegacyIf(line);
                        if (bracedLegacyIfClause) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(
                                    bracedLegacyIfClause.indentation,
                                    bracedLegacyIfClause.header,
                                    bracedLegacyIfClause.statement
                                )
                            );
                            continue;
                        }

                        const doHeaderIndentation = parseLineOnlyDoHeader(line);
                        const nextLine = lines[index + 1] ?? "";
                        const afterNextLine = lines[index + 2] ?? "";
                        if (doHeaderIndentation !== null && isSafeSingleLineControlFlowStatement(nextLine)) {
                            const untilCondition = parseLineOnlyUntilFooter(afterNextLine);
                            if (untilCondition) {
                                rewrittenLines.push(
                                    ...toBracedDoUntilClause(doHeaderIndentation, nextLine.trim(), untilCondition)
                                );
                                index += 2;
                                continue;
                            }
                        }

                        const controlFlowHeader = parseLineOnlyControlFlowHeader(line);
                        if (controlFlowHeader && isSafeSingleLineControlFlowStatement(nextLine)) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(
                                    controlFlowHeader.indentation,
                                    controlFlowHeader.header,
                                    nextLine.trim()
                                )
                            );
                            index += 1;
                            continue;
                        }

                        rewrittenLines.push(line);
                    }

                    const rewritten = rewrittenLines.join(lineEnding);
                    if (rewritten !== text) {
                        context.report({
                            loc: { line: 1, column: 0 },
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([0, text.length], rewritten)
                        });
                    }
                }
            });
        }
    });
}
