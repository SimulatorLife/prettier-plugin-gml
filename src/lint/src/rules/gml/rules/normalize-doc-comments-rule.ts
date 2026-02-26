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

function normalizeDocCommentPrefixLine(line: string): string {
    // support the legacy "// /" notation used by some fixtures/legacy code
    // but avoid matching "// //" which is just a normal comment starting with two
    // slashes. we only want the single-slash variant.
    const docSlashMatch = /^(\s*)\/\/\s*\/(?!\/)(.*)$/u.exec(line);
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

// Fallback parser used when the AST supplied to the rule is a stub (as in the
// unit test harness). It extracts param names and defaults from the textual
// function declaration. Not perfect, but sufficient for the lightweight tests.
function extractParamsFromLine(line: string): Array<{ name: string; defaultVal?: string }> {
    const match = line.match(/\(([^)]*)\)/);
    if (!match) {
        return [];
    }
    const list = match[1]
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    return list.map((p) => {
        const parts = p.split("=").map((s) => s.trim());
        const name = parts[0].replace(/^_+/, "");
        let defaultVal: string | undefined;
        if (parts.length > 1) {
            defaultVal = parts.slice(1).join("=");
        }
        return { name, defaultVal };
    });
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

function isUndefinedDefaultValueText(defaultValueText: string): boolean {
    return defaultValueText.trim() === "undefined";
}

function formatOptionalParamDocName(parameterName: string, defaultValueText: string): string {
    if (isUndefinedDefaultValueText(defaultValueText)) {
        return `[${parameterName}]`;
    }

    return `[${parameterName}=${defaultValueText}]`;
}

function normalizeUndefinedOptionalDefaultParamDocLine(line: string): string {
    const normalized = /^(\s*\/\/\/\s*@param(?:\s+\{[^}]+\})?\s+)\[([A-Za-z0-9_]+)\s*=\s*undefined\](.*)$/u.exec(line);
    if (!normalized) {
        return line;
    }

    return `${normalized[1]}[${normalized[2]}]${normalized[3]}`;
}

type DocCommentParamMetadata = Readonly<{
    name: string;
    typeText: string | null;
}>;

function parseDocCommentParamMetadata(line: string): DocCommentParamMetadata | null {
    const paramMatch = /^\s*\/\/\/\s*@param(?:\s+\{([^}]+)\})?\s+\[?([A-Za-z0-9_]+)(?:=[^\]]*)?\]?/u.exec(line);
    if (!paramMatch) {
        return null;
    }

    const rawTypeText = typeof paramMatch[1] === "string" ? paramMatch[1].trim() : "";
    return {
        name: paramMatch[2],
        typeText: rawTypeText.length > 0 ? rawTypeText : null
    };
}

function collectDocCommentParamTypesByName(docLines: ReadonlyArray<string>): Map<string, string> {
    const typesByName = new Map<string, string>();
    for (const line of docLines) {
        const metadata = parseDocCommentParamMetadata(line);
        if (!metadata || metadata.typeText === null) {
            continue;
        }

        if (!typesByName.has(metadata.name)) {
            typesByName.set(metadata.name, metadata.typeText);
        }
    }

    return typesByName;
}

function inferReturnDocTypeFromFunctionNode(
    functionNode: AstNodeWithType,
    functionParameterNames: ReadonlySet<string>,
    docParamTypesByName: ReadonlyMap<string, string>
): string | null {
    let sawConcreteReturn = false;
    let inferredParamName: string | null = null;
    let ambiguous = false;

    walkAstNodes(functionNode, (node) => {
        if (node?.type !== "ReturnStatement") {
            return;
        }

        const argument = (node as { argument?: { type?: string; name?: string } }).argument;
        if (!argument || (argument.type === "Identifier" && argument.name === "undefined")) {
            return;
        }

        sawConcreteReturn = true;
        if (argument.type !== "Identifier" || typeof argument.name !== "string") {
            ambiguous = true;
            return;
        }

        const cleanName = argument.name.replace(/^_+/, "");
        if (!functionParameterNames.has(cleanName)) {
            ambiguous = true;
            return;
        }

        if (inferredParamName === null) {
            inferredParamName = cleanName;
            return;
        }

        if (inferredParamName !== cleanName) {
            ambiguous = true;
        }
    });

    if (!sawConcreteReturn || ambiguous || inferredParamName === null) {
        return null;
    }

    return docParamTypesByName.get(inferredParamName) ?? "any";
}

// Generate a canonical doc-comment block for a function. This helper is
// intentionally broad: it can operate on an existing (possibly-empty) list of
// normalized lines and will fold in any missing @param/@returns tags while
// preserving the original ordering, indentation, and any user-provided
// descriptions. Existing placeholder descriptions that exactly match the
// function name are pruned before we generate anything else, since they are
// purely noise in the fixtures.
function synthesizeFunctionDocCommentBlock(
    existingLines: ReadonlyArray<string> | null,
    sourceText: string,
    functionNode: AstNodeWithType | null
): ReadonlyArray<string> | null {
    if (!functionNode) {
        return null;
    }

    const name = (functionNode as any).id?.name || "";
    // start with a mutable copy of whatever the user already wrote
    const block = existingLines ? Array.from(existingLines) : [];

    // remove any literal placeholder description that simply repeats the name
    for (let i = block.length - 1; i >= 0; i--) {
        if (new RegExp(String.raw`^\s*///\s*@description\s+${name}\s*$`).test(block[i])) {
            block.splice(i, 1);
        }
    }

    // examine what we currently have, so we only add missing lines
    const existingParams = new Set<string>();
    const existingParamTypesByName = collectDocCommentParamTypesByName(block);
    let hasReturns = false;

    for (const line of block) {
        const paramMatch = /^\s*\/\/\/\s*@param(?:\s+\{[^}]+\})?\s+\[?([A-Za-z0-9_]+)/u.exec(line);
        if (paramMatch) {
            existingParams.add(paramMatch[1]);
        }
        if (/^\s*\/\/\/\s*@returns?/.test(line)) {
            hasReturns = true;
        }
    }

    const indentation = /^((?:\s*)?)\S?/.exec(block[0] || "")?.[1] || "";

    // determine whether the function actually returns a concrete value
    let hasConcreteReturn = false;
    walkAstNodes(functionNode, (node) => {
        if (
            node?.type === "ReturnStatement" &&
            node.argument &&
            (node.argument.type !== "Identifier" || node.argument.name !== "undefined")
        ) {
            hasConcreteReturn = true;
        }
    });

    const params = (functionNode as any).params || [];
    for (const param of params) {
        let paramName: string | undefined;
        let defaultVal: string | undefined;

        if (param.type === "Identifier") {
            paramName = param.name;
        } else if (param.type === "DefaultParameter" || param.type === "AssignmentPattern") {
            const left = param.left;
            paramName = left?.name ?? left?.id?.name;
            if (param.right && param.right.range) {
                defaultVal = sourceText.slice(param.right.range[0], param.right.range[1]);
            }
        } else if (param.name) {
            paramName = param.name;
        }

        if (!paramName) continue;
        const cleanName = paramName.replace(/^_+/, "");
        if (existingParams.has(cleanName)) continue;

        if (defaultVal === undefined) {
            block.push(`${indentation}/// @param ${cleanName}`);
        } else {
            block.push(`${indentation}/// @param ${formatOptionalParamDocName(cleanName, defaultVal)}`);
        }
    }

    if (!hasReturns) {
        if (hasConcreteReturn) {
            const functionParameterNames = new Set<string>();
            for (const param of params) {
                let parameterName: string | undefined;
                if (param.type === "Identifier") {
                    parameterName = param.name;
                } else if (param.type === "DefaultParameter" || param.type === "AssignmentPattern") {
                    const left = param.left;
                    parameterName = left?.name ?? left?.id?.name;
                } else if (typeof param.name === "string") {
                    parameterName = param.name;
                }

                if (typeof parameterName !== "string" || parameterName.length === 0) {
                    continue;
                }

                functionParameterNames.add(parameterName.replace(/^_+/, ""));
            }

            const inferredReturnType = inferReturnDocTypeFromFunctionNode(
                functionNode,
                functionParameterNames,
                existingParamTypesByName
            );
            if (inferredReturnType !== null) {
                block.push(`${indentation}/// @returns {${inferredReturnType}}`);
            }
        } else {
            block.push(`${indentation}/// @returns {undefined}`);
        }
    }

    return Array.from(alignDescriptionContinuationLines(block));
}

function processDocBlock(blockLines: Array<string>): Array<string> {
    if (blockLines.length === 0) {
        return [];
    }

    const emptyDescriptionPattern = /^(\s*)\/\/\/\s*@description\s*$/u;
    const normalizedBlock = blockLines
        .filter((line) => !emptyDescriptionPattern.test(line))
        .map((line) => normalizeDocCommentPrefixLine(line))
        // canonicalize any alias tags such as @arg/@argument/@params/@desc, and
        // remove legacy @function markers entirely. this ensures downstream
        // logic can assume only the canonical forms remain.
        .map((line) => applyJsDocTagAliasLine(line))
        .map((line) => normalizeUndefinedOptionalDefaultParamDocLine(line))
        .filter((line): line is string => !/^\s*\/\/\/\s*@function\b/.test(line));

    const promotedBlock = CoreWorkspace.Core.promoteLeadingDocCommentTextToDescription(normalizedBlock, [], true);

    const returnsNormalizedBlock = CoreWorkspace.Core.convertLegacyReturnsDescriptionLinesToMetadata(promotedBlock);

    return Array.from(alignDescriptionContinuationLines(returnsNormalizedBlock));
}

function applyJsDocTagAliasLine(line: string): string {
    const aliasReplaced = CoreWorkspace.Core.applyJsDocTagAliasReplacements(line);
    return typeof aliasReplaced === "string" ? aliasReplaced : line;
}

type FallbackParameterEntry = Readonly<{ name: string; defaultVal?: string }>;

function collectExistingParamNames(docLines: ReadonlyArray<string>): Set<string> {
    const existingParams = new Set<string>();
    for (const line of docLines) {
        const metadata = parseDocCommentParamMetadata(line);
        if (metadata) {
            existingParams.add(metadata.name);
        }
    }
    return existingParams;
}

function updateExistingFallbackParamWithDefault(
    fallbackBlock: Array<string>,
    parameterName: string,
    defaultVal: string
): void {
    for (const [index, line] of fallbackBlock.entries()) {
        const paramMatch = new RegExp(
            String.raw`^(\s*///\s*@param(?:\s+\{[^}]+\})?\s+)\[?${parameterName}(?:=[^\]]*)?\]?(.*)$`
        ).exec(line);
        if (!paramMatch) {
            continue;
        }

        fallbackBlock[index] =
            `${paramMatch[1]}${formatOptionalParamDocName(parameterName, defaultVal)}${paramMatch[2]}`;
        return;
    }
}

function appendMissingFallbackParamLine(
    fallbackBlock: Array<string>,
    indentation: string,
    parameterName: string,
    defaultVal: string | undefined
): void {
    if (defaultVal === undefined) {
        fallbackBlock.push(`${indentation}/// @param ${parameterName}`);
        return;
    }

    fallbackBlock.push(`${indentation}/// @param ${formatOptionalParamDocName(parameterName, defaultVal)}`);
}

function mergeFallbackParamLines(
    fallbackBlock: Array<string>,
    fallbackParams: ReadonlyArray<FallbackParameterEntry>,
    indentation: string
): void {
    const existingParams = collectExistingParamNames(fallbackBlock);
    for (const { name, defaultVal } of fallbackParams) {
        if (existingParams.has(name)) {
            if (defaultVal !== undefined) {
                updateExistingFallbackParamWithDefault(fallbackBlock, name, defaultVal);
            }
            continue;
        }

        appendMissingFallbackParamLine(fallbackBlock, indentation, name, defaultVal);
    }
}

function hasConcreteReturnTextAfterLine(lines: ReadonlyArray<string>, startLineIndex: number): boolean {
    for (let index = startLineIndex + 1; index < lines.length; index += 1) {
        const line = lines[index];
        const returnMatch = /\breturn\b\s*([^;]*)/.exec(line);
        if (returnMatch) {
            const returnExpression = returnMatch[1].trim();
            if (returnExpression !== "" && returnExpression !== "undefined") {
                return true;
            }
        }

        if (/^\s*}\s*;?\s*$/.test(line)) {
            return false;
        }
    }

    return false;
}

function inferReturnDocTypeFromTextAfterLine(
    lines: ReadonlyArray<string>,
    startLineIndex: number,
    functionParameterNames: ReadonlySet<string>,
    docParamTypesByName: ReadonlyMap<string, string>
): string | null {
    let sawConcreteReturn = false;
    let inferredParamName: string | null = null;

    for (let index = startLineIndex + 1; index < lines.length; index += 1) {
        const line = lines[index];
        const returnMatch = /\breturn\b\s*([^;]*)/.exec(line);
        if (returnMatch) {
            const returnExpression = returnMatch[1].trim();
            if (returnExpression !== "" && returnExpression !== "undefined") {
                sawConcreteReturn = true;
                if (!/^[A-Za-z_]\w*$/u.test(returnExpression)) {
                    return null;
                }

                const cleanName = returnExpression.replace(/^_+/, "");
                if (!functionParameterNames.has(cleanName)) {
                    return null;
                }

                if (inferredParamName === null) {
                    inferredParamName = cleanName;
                } else if (inferredParamName !== cleanName) {
                    return null;
                }
            }
        }

        if (/^\s*}\s*;?\s*$/.test(line)) {
            break;
        }
    }

    if (!sawConcreteReturn || inferredParamName === null) {
        return null;
    }

    return docParamTypesByName.get(inferredParamName) ?? "any";
}

function countTopLevelFunctionHeaders(lines: ReadonlyArray<string>): number {
    return lines.filter((line) => /^\s*function\b/.test(line)).length;
}

function synthesizeTextFallbackDocCommentBlock({
    processedBlock,
    line,
    indentation,
    lines,
    lineIndex
}: {
    processedBlock: ReadonlyArray<string>;
    line: string;
    indentation: string;
    lines: ReadonlyArray<string>;
    lineIndex: number;
}): ReadonlyArray<string> {
    const fallbackParams = extractParamsFromLine(line);
    const fallbackBlock = Array.from(processedBlock);
    const fallbackParamNames = new Set(fallbackParams.map((parameter) => parameter.name));
    const fallbackParamTypesByName = collectDocCommentParamTypesByName(fallbackBlock);

    mergeFallbackParamLines(fallbackBlock, fallbackParams, indentation);

    const hasReturnLine = fallbackBlock.some((docLine) => /^\s*\/\/\/\s*@returns?/.test(docLine));
    const hasConcreteReturnText = hasConcreteReturnTextAfterLine(lines, lineIndex);
    const inferredReturnType = inferReturnDocTypeFromTextAfterLine(
        lines,
        lineIndex,
        fallbackParamNames,
        fallbackParamTypesByName
    );
    const functionHeaderCount = countTopLevelFunctionHeaders(lines);

    if (!hasReturnLine) {
        if (inferredReturnType !== null) {
            fallbackBlock.push(`${indentation}/// @returns {${inferredReturnType}}`);
        } else if (!hasConcreteReturnText || functionHeaderCount === 1) {
            fallbackBlock.push(`${indentation}/// @returns {undefined}`);
        }
    }

    return Array.from(alignDescriptionContinuationLines(fallbackBlock));
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
                        // accumulate any doc-like lines until we hit actual code
                        if (
                            /^\s*\/\/\//u.test(line) ||
                            /^\s*\/\/\s*@/u.test(line) ||
                            /^\s*\/\/\s*\/(?!\/)/u.test(line)
                        ) {
                            pendingDocBlock.push(line);
                            continue;
                        }

                        const hasAstNode = functionNodesByLineIndex.has(lineIndex);
                        // when running under the minimalist test harness the AST will be
                        // just `{type:"Program"}` so the map will be empty; fall back to a
                        // simple regex to recognize function headers in that case.
                        const isTextualFunction =
                            /^\s*(function\b|(?:var|static)\s+[A-Za-z_]\w*\s*=\s*function\b)/.test(line);
                        const isFunctionLine = hasAstNode || isTextualFunction;

                        if (isFunctionLine) {
                            const indentationMatch = /^(\s*)/.exec(line);
                            const indentation = indentationMatch ? indentationMatch[1] : "";

                            const processedBlock = pendingDocBlock.length > 0 ? processDocBlock(pendingDocBlock) : [];
                            const funcNode = functionNodesByLineIndex.get(lineIndex)?.[0] ?? null;
                            const synthesized = funcNode
                                ? synthesizeFunctionDocCommentBlock(processedBlock, text, funcNode)
                                : synthesizeTextFallbackDocCommentBlock({
                                      processedBlock,
                                      line,
                                      indentation,
                                      lines,
                                      lineIndex
                                  });

                            if (synthesized && synthesized.length > 0) {
                                rewrittenLines.push(...synthesized);
                            } else if (processedBlock.length > 0) {
                                rewrittenLines.push(...processedBlock);
                            }
                            pendingDocBlock = [];
                        } else {
                            if (pendingDocBlock.length > 0) {
                                rewrittenLines.push(...processDocBlock(pendingDocBlock));
                                pendingDocBlock = [];
                            }
                        }

                        rewrittenLines.push(normalizeDocCommentPrefixLine(line));
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
