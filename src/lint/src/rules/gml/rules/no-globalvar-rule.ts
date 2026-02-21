import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { reportMissingProjectContextOncePerFile,resolveProjectContextForRule } from "../../project-context.js";
import {
    type AstNodeRecord,
    createMeta,
    findFirstChangedCharacterOffset,
    getNodeEndIndex,
    getNodeStartIndex,
    isAstNodeRecord} from "../rule-base-helpers.js";
import { isIdentifier, readObjectOption, shouldReportUnsafe } from "../rule-helpers.js";

type TextEdit = Readonly<{
    start: number;
    end: number;
    replacement: string;
}>;

type GlobalVarStatementRange = Readonly<{
    start: number;
    end: number;
    names: ReadonlyArray<string>;
}>;

function shouldRewriteGlobalvarIdentifierNode(
    identifierNode: AstNodeRecord,
    parentNode: AstNodeRecord | null
): boolean {
    if (!parentNode) {
        return false;
    }

    if (identifierNode.name === "global") {
        return false;
    }

    if (parentNode.type === "GlobalVarStatement") {
        return false;
    }

    if (parentNode.type === "MemberDotExpression" && parentNode.property === identifierNode) {
        return false;
    }

    if ((parentNode.type === "Property" || parentNode.type === "EnumMember") && parentNode.name === identifierNode) {
        return false;
    }

    if (
        (parentNode.type === "VariableDeclarator" ||
            parentNode.type === "FunctionDeclaration" ||
            parentNode.type === "ConstructorDeclaration" ||
            parentNode.type === "ConstructorParentClause") &&
        parentNode.id === identifierNode
    ) {
        return false;
    }

    return true;
}

function collectGlobalVarStatements(programNode: unknown): ReadonlyArray<GlobalVarStatementRange> {
    const statements: Array<GlobalVarStatementRange> = [];

    const visit = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element);
            }
            return;
        }

        if (!isAstNodeRecord(node)) {
            return;
        }

        if (node.type === "GlobalVarStatement") {
            const start = getNodeStartIndex(node);
            const endExclusive = getNodeEndIndex(node);
            if (typeof start === "number" && typeof endExclusive === "number") {
                const declarations = CoreWorkspace.Core.asArray<Record<string, unknown>>(node.declarations);
                const names = declarations
                    .map((declaration) => CoreWorkspace.Core.getIdentifierText(declaration.id ?? null))
                    .filter((name): name is string => isIdentifier(name));

                if (names.length > 0) {
                    statements.push(
                        Object.freeze({
                            start,
                            end: endExclusive,
                            names
                        })
                    );
                }
            }
        }

        CoreWorkspace.Core.forEachNodeChild(node, (childNode) => visit(childNode));
    };

    visit(programNode);
    return statements;
}

function collectGlobalIdentifierReplacementEdits(
    programNode: unknown,
    globalVarStatements: ReadonlyArray<GlobalVarStatementRange>
): ReadonlyArray<TextEdit> {
    const declaredNames = new Set<string>();
    for (const statement of globalVarStatements) {
        for (const name of statement.names) {
            declaredNames.add(name);
        }
    }

    if (declaredNames.size === 0) {
        return [];
    }

    const edits: Array<TextEdit> = [];
    const isWithinGlobalVarDeclaration = (start: number, end: number): boolean =>
        globalVarStatements.some((statement) => start >= statement.start && end <= statement.end);

    const visit = (node: unknown, parentNode: Record<string, unknown> | null): void => {
        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element, parentNode);
            }
            return;
        }

        if (!isAstNodeRecord(node)) {
            return;
        }

        if (node.type === "Identifier" && typeof node.name === "string" && declaredNames.has(node.name)) {
            const start = getNodeStartIndex(node);
            const endExclusive = getNodeEndIndex(node);
            if (
                typeof start === "number" &&
                typeof endExclusive === "number" &&
                shouldRewriteGlobalvarIdentifierNode(node, parentNode as AstNodeRecord) &&
                !isWithinGlobalVarDeclaration(start, endExclusive)
            ) {
                edits.push(
                    Object.freeze({
                        start,
                        end: endExclusive,
                        replacement: `global.${node.name}`
                    })
                );
            }
        }

        CoreWorkspace.Core.forEachNodeChild(node, (childNode) => visit(childNode, node as Record<string, unknown>));
    };

    visit(programNode, null);
    return edits;
}

function collectGlobalVarDeclarationRemovalEdits(
    sourceText: string,
    globalVarStatements: ReadonlyArray<GlobalVarStatementRange>
): ReadonlyArray<TextEdit> {
    return globalVarStatements.map((statement) => {
        const start = statement.start;
        let end = statement.end;

        if (sourceText[end] === "\r" && sourceText[end + 1] === "\n") {
            end += 2;
        } else if (sourceText[end] === "\n") {
            end += 1;
        }

        return Object.freeze({
            start,
            end,
            replacement: ""
        });
    });
}

function applyTextEdits(sourceText: string, edits: ReadonlyArray<TextEdit>): string {
    if (edits.length === 0) {
        return sourceText;
    }

    const sortedEdits = edits
        .filter((edit) => edit.start >= 0 && edit.end >= edit.start && edit.end <= sourceText.length)
        .toSorted((left, right) => {
            if (left.start !== right.start) {
                return left.start - right.start;
            }

            return left.end - right.end;
        });

    const nonOverlappingEdits: Array<TextEdit> = [];
    let previousEnd = -1;
    for (const edit of sortedEdits) {
        if (edit.start < previousEnd) {
            continue;
        }

        nonOverlappingEdits.push(edit);
        previousEnd = edit.end;
    }

    let rewrittenText = sourceText;
    for (const edit of nonOverlappingEdits.toReversed()) {
        rewrittenText = rewrittenText.slice(0, edit.start) + edit.replacement + rewrittenText.slice(edit.end);
    }

    return rewrittenText;
}

export function createNoGlobalvarRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const enableAutofix = options.enableAutofix === undefined ? true : options.enableAutofix === true;
            const shouldReportUnsafeFixes = shouldReportUnsafe(context);
            const projectContext = resolveProjectContextForRule(context, definition);

            const listener: Rule.RuleListener = {
                Program(programNode) {
                    const text = context.sourceCode.text;
                    const sourcePath = context.sourceCode.parserServices?.gml?.filePath;
                    const filePath = typeof sourcePath === "string" ? sourcePath : null;
                    const globalVarStatements = collectGlobalVarStatements(programNode);
                    if (globalVarStatements.length === 0) {
                        return;
                    }

                    const assessGlobalVarRewrite =
                        projectContext.context && typeof projectContext.context.assessGlobalVarRewrite === "function"
                            ? projectContext.context.assessGlobalVarRewrite.bind(projectContext.context)
                            : null;
                    const rewriteAssessment = assessGlobalVarRewrite?.(filePath, false) ?? {
                        allowRewrite: true,
                        reason: null
                    };

                    const firstStatementStart = globalVarStatements[0]?.start ?? 0;
                    if (!rewriteAssessment.allowRewrite) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(firstStatementStart),
                            messageId: shouldReportUnsafeFixes ? "unsafeFix" : definition.messageId
                        });
                        return;
                    }

                    const edits = [
                        ...collectGlobalVarDeclarationRemovalEdits(text, globalVarStatements),
                        ...collectGlobalIdentifierReplacementEdits(programNode, globalVarStatements)
                    ];
                    const rewrittenText = applyTextEdits(text, edits);
                    if (rewrittenText === text) {
                        return;
                    }

                    const firstChangedOffset = findFirstChangedCharacterOffset(text, rewrittenText);
                    if (!enableAutofix) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                            messageId: definition.messageId
                        });
                        return;
                    }

                    context.report({
                        loc: context.sourceCode.getLocFromIndex(firstChangedOffset),
                        messageId: definition.messageId,
                        fix: (fixer) => fixer.replaceTextRange([0, text.length], rewrittenText)
                    });
                }
            };

            if (!projectContext.available) {
                return reportMissingProjectContextOncePerFile(context, listener);
            }

            return Object.freeze(listener);
        }
    });
}
