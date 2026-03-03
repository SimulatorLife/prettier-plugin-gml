import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, reportFullTextRewrite } from "../rule-base-helpers.js";
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

    if ((match[3] ?? "").includes("{")) {
        return null;
    }
    if (!(match[3] ?? "").includes(";")) {
        return null;
    }

    return Object.freeze({
        indentation: match[1] ?? "",
        header: match[2] ?? "",
        statement: match[3]?.trim() ?? ""
    });
}

function parseInlineRepeatClause(line: string): BracedSingleClause | null {
    const match = /^([\t ]*)(repeat)\s*\(([^)]*)\)\s*(?!\{)(.+)$/u.exec(line);
    if (!match || match.length < 5 || match[4]?.trim() === "") {
        return null;
    }
    if (!(match[4] ?? "").includes(";")) {
        return null;
    }

    return Object.freeze({
        indentation: match[1] ?? "",
        header: `${match[2] ?? "repeat"} (${match[3] ?? ""})`,
        statement: match[4]?.trim() ?? ""
    });
}

function parseLineOnlyControlFlowHeader(line: string): ControlFlowLineHeader | null {
    const repeatMatch = /^([\t ]*)(repeat\s*\([^)]*\))\s*$/u.exec(line);
    if (repeatMatch && repeatMatch.length >= 3) {
        return Object.freeze({
            indentation: repeatMatch[1] ?? "",
            header: repeatMatch[2] ?? ""
        });
    }

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
    if (!/^\s*if\s+\S+/iu.test(header)) {
        return null;
    }
    if (!statement.includes(";")) {
        return null;
    }

    const legacyThenMatch = /^if\s+(.+?)\s+then$/iu.exec(header);
    const normalizedHeader = legacyThenMatch ? `if (${legacyThenMatch[1] ?? ""})` : header;

    return Object.freeze({
        indentation: match[1] ?? "",
        header: normalizedHeader,
        statement
    });
}

function parseInlineElseClause(line: string): BracedSingleClause | null {
    const match = /^([\t ]*)(else)\b\s*(?!\{)(?!if\b)(.+)$/u.exec(line);
    if (!match || match.length < 4 || match[3]?.trim() === "") {
        return null;
    }

    return Object.freeze({
        indentation: match[1] ?? "",
        header: "else",
        statement: match[3]?.trim() ?? ""
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
                        if (/^\s*(if|while|for|with|repeat)\b.*\{\s*\/\//u.test(line)) {
                            rewrittenLines.push(line);
                            continue;
                        }

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

                        const bracedRepeatClause = parseInlineRepeatClause(line);
                        if (bracedRepeatClause) {
                            rewrittenLines.push(
                                ...toBracedSingleClause(
                                    bracedRepeatClause.indentation,
                                    bracedRepeatClause.header,
                                    bracedRepeatClause.statement
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
                        const trimmedNextLine = nextLine.trimStart();
                        const isConditionContinuation =
                            trimmedNextLine.startsWith("||") || trimmedNextLine.startsWith("&&");
                        if (
                            controlFlowHeader &&
                            !isConditionContinuation &&
                            isSafeSingleLineControlFlowStatement(nextLine)
                        ) {
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
                    reportFullTextRewrite(context, definition.messageId, text, rewritten);
                }
            });
        }
    });
}
