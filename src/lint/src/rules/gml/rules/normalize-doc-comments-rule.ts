import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import {
    type AstNodeWithType,
    computeLineStartOffsets,
    createMeta,
    getLineIndexForOffset,
    reportFullTextRewrite,
    walkAstNodes
} from "../rule-base-helpers.js";
import { dominantLineEnding } from "../rule-helpers.js";

const { getNodeStartIndex } = CoreWorkspace.Core;

type FunctionDocCommentTarget = Readonly<{
    functionName: string;
    description: string | null;
    parameterNames: ReadonlyArray<string>;
    parameterDescriptions: ReadonlyMap<string, string>;
    returnsDescription: string | null;
}>;

type TrailingDocCommentBlock = Readonly<{
    startIndex: number;
    lines: ReadonlyArray<string>;
}>;

function normalizeDocCommentPrefixLine(line: string): string {
    // support the legacy "// /" notation used by some fixtures/legacy code
    const docSlashMatch = /^(\s*)\/\/\s*\/\s*(.*)$/u.exec(line);
    if (docSlashMatch) {
        const content = docSlashMatch[2].trim();
        if (content.length === 0) {
            return `${docSlashMatch[1]}///`;
        }
        return `${docSlashMatch[1]}/// ${content}`;
    }

    const tripleSlashMatch = /^(\s*)\/\/\/\s*@(.*)$/u.exec(line);
    if (tripleSlashMatch) {
        return `${tripleSlashMatch[1]}/// @${tripleSlashMatch[2].trim()}`;
    }

    const doubleSlashAtMatch = /^(\s*)\/\/\s*@(.*)$/u.exec(line);
    if (doubleSlashAtMatch) {
        return `${doubleSlashAtMatch[1]}/// @${doubleSlashAtMatch[2].trim()}`;
    }

    const tripleSlashNoAtMatch = /^(\s*)\/\/\/\s*(.*)$/u.exec(line);
    if (tripleSlashNoAtMatch) {
        const content = tripleSlashNoAtMatch[2].trim();
        if (content.length === 0) {
            return `${tripleSlashNoAtMatch[1]}///`;
        }
        return `${tripleSlashNoAtMatch[1]}/// ${content}`;
    }

    return line;
}

function parseFunctionDocCommentTarget(line: string): FunctionDocCommentTarget | null {
    const functionMatch = /^(\s*)\/\/\/\s*@function\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*(.+))?$/u.exec(line);
    if (!functionMatch) {
        return null;
    }

    const functionName = functionMatch[2];
    const description = functionMatch[3]?.trim() ?? null;

    return {
        functionName,
        description,
        parameterNames: [],
        parameterDescriptions: new Map(),
        returnsDescription: null
    };
}

function collectFunctionNodesByStartLine(
    programNode: unknown,
    lineStartOffsets: ReadonlyArray<number>
): Map<number, Array<AstNodeWithType>> {
    const nodesByLine = new Map<number, Array<AstNodeWithType>>();
    walkAstNodes(programNode, (node) => {
        if (node?.type !== "FunctionDeclaration" && node?.type !== "ConstructorDeclaration") {
            return;
        }

        const start = getNodeStartIndex(node);
        if (typeof start !== "number") {
            return;
        }

        const lineIndex = getLineIndexForOffset(lineStartOffsets, start);
        const existing = nodesByLine.get(lineIndex) ?? [];
        existing.push(node);
        nodesByLine.set(lineIndex, existing);
    });

    return nodesByLine;
}

function resolveFunctionNodeForDocCommentTarget(
    target: FunctionDocCommentTarget,
    candidateNodes: ReadonlyArray<AstNodeWithType>
): AstNodeWithType | null {
    for (const node of candidateNodes) {
        if ((node as any).id?.name === target.functionName) {
            return node;
        }
    }

    return candidateNodes[0] ?? null;
}

function readTrailingDocCommentBlock(lines: ReadonlyArray<string>): TrailingDocCommentBlock | null {
    if (lines.length === 0) {
        return null;
    }

    const blockLines: Array<string> = [];
    let startIndex = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (/^\s*\/\/\//u.test(line)) {
            blockLines.unshift(line);
            startIndex = i;
        } else {
            break;
        }
    }

    if (blockLines.length === 0) {
        return null;
    }

    return {
        startIndex,
        lines: blockLines
    };
}

function alignDescriptionContinuationLines(docLines: ReadonlyArray<string>): ReadonlyArray<string> {
    const aligned: Array<string> = [];
    let inDescription = false;
    let descriptionIndentation = "";

    for (const line of docLines) {
        const descMatch = /^(\s*)\/\/\/\s*@description\s+(.*)$/u.exec(line);
        if (descMatch) {
            inDescription = true;
            descriptionIndentation = `${descMatch[1]}/// `;
            aligned.push(line);
            continue;
        }

        if (inDescription && /^\s*\/\/\/\s*[^@\s]/u.test(line)) {
            const content = line.trimStart().slice(3).trimStart();
            aligned.push(`${descriptionIndentation}${content}`);
            continue;
        }

        if (/^\s*\/\/\/\s*@/u.test(line)) {
            inDescription = false;
        }

        aligned.push(line);
    }

    return aligned;
}

function synthesizeFunctionDocCommentBlock(
    target: FunctionDocCommentTarget,
    existingLines: ReadonlyArray<string> | null,
    _sourceText: string,
    functionNode: AstNodeWithType | null
): ReadonlyArray<string> | null {
    if (!functionNode) {
        return null;
    }

    const params = (functionNode as any).params || [];
    const synthesized: Array<string> = [];
    const indentation = /^(\s*)/.exec(existingLines?.[0] ?? "")?.[1] ?? "";

    synthesized.push(`${indentation}/// @function ${target.functionName}`);
    if (target.description) {
        synthesized.push(`${indentation}/// @description ${target.description}`);
    }

    for (const param of params) {
        const paramName = param.id?.name || param.name;
        if (paramName) {
            synthesized.push(`${indentation}/// @param {any} ${paramName}`);
        }
    }

    return synthesized;
}

function processDocBlock(blockLines: Array<string>): Array<string> {
    if (blockLines.length === 0) {
        return [];
    }

    const emptyDescriptionPattern = /^(\s*)\/\/\* @description\s*$/u;
    const normalizedBlock = blockLines
        .filter((line) => !emptyDescriptionPattern.test(line))
        .map((line) => normalizeDocCommentPrefixLine(line));

    const promotedBlock = CoreWorkspace.Core.promoteLeadingDocCommentTextToDescription(normalizedBlock, [], true);

    const returnsNormalizedBlock = CoreWorkspace.Core.convertLegacyReturnsDescriptionLinesToMetadata(promotedBlock);

    return Array.from(alignDescriptionContinuationLines(returnsNormalizedBlock));
}

export function createNormalizeDocCommentsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(programNode) {
                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
                    const lineStartOffsets = computeLineStartOffsets(text);
                    const functionNodesByLineIndex = collectFunctionNodesByStartLine(programNode, lineStartOffsets);
                    const rewrittenLines: Array<string> = [];

                    let pendingDocBlock: Array<string> = [];
                    for (const [lineIndex, line] of lines.entries()) {
                        if (
                            /^\s*\/\/\//u.test(line) ||
                            /^\s*\/\/\s*@/u.test(line) ||
                            /^\s*\/\/\s*\/(?!\/)/u.test(line)
                        ) {
                            pendingDocBlock.push(line);
                            continue;
                        }

                        if (pendingDocBlock.length > 0) {
                            rewrittenLines.push(...processDocBlock(pendingDocBlock));
                            pendingDocBlock = [];
                        }

                        const normalizedLine = normalizeDocCommentPrefixLine(line);
                        const docCommentTarget = parseFunctionDocCommentTarget(normalizedLine);
                        if (docCommentTarget) {
                            const functionNode = resolveFunctionNodeForDocCommentTarget(
                                docCommentTarget,
                                functionNodesByLineIndex.get(lineIndex) ?? []
                            );
                            const trailingDocCommentBlock = readTrailingDocCommentBlock(rewrittenLines);
                            const synthesizedDocCommentBlock = synthesizeFunctionDocCommentBlock(
                                docCommentTarget,
                                trailingDocCommentBlock?.lines ?? null,
                                text,
                                functionNode
                            );

                            if (synthesizedDocCommentBlock) {
                                if (trailingDocCommentBlock) {
                                    rewrittenLines.splice(
                                        trailingDocCommentBlock.startIndex,
                                        trailingDocCommentBlock.lines.length,
                                        ...synthesizedDocCommentBlock
                                    );
                                } else {
                                    rewrittenLines.push(...synthesizedDocCommentBlock);
                                }
                            }
                        }

                        rewrittenLines.push(normalizedLine);
                    }

                    if (pendingDocBlock.length > 0) {
                        rewrittenLines.push(...processDocBlock(pendingDocBlock));
                    }

                    const rewritten = rewrittenLines.join(lineEnding);
                    reportFullTextRewrite(context, definition.messageId, text, rewritten);
                }
            });
        }
    });
}
