import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import {
    type AstNodeWithType,
    computeLineStartOffsets,
    createMeta,
    getLineIndexForOffset,
    getNodeEndIndex,
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

type FunctionLineCandidate = Readonly<{
    functionNode: AstNodeWithType;
    assignmentStyle: boolean;
    sourceNode: AstNodeWithType;
}>;

function isFunctionInitializerNode(node: unknown): node is AstNodeWithType {
    if (!node || typeof node !== "object") {
        return false;
    }

    const nodeType = Reflect.get(node, "type");
    return (
        nodeType === "FunctionDeclaration" || nodeType === "FunctionExpression" || nodeType === "ConstructorDeclaration"
    );
}

function getFunctionCandidateForNode(node: AstNodeWithType): FunctionLineCandidate | null {
    if (node.type === "FunctionDeclaration" || node.type === "ConstructorDeclaration") {
        return { functionNode: node, assignmentStyle: false, sourceNode: node };
    }

    if (node.type === "VariableDeclaration") {
        const declarations = Reflect.get(node, "declarations");
        if (!Array.isArray(declarations) || declarations.length !== 1) {
            return null;
        }

        const declarator = declarations[0] as { type?: string; init?: unknown } | undefined;
        if (!declarator || declarator.type !== "VariableDeclarator" || !isFunctionInitializerNode(declarator.init)) {
            return null;
        }

        return { functionNode: declarator.init, assignmentStyle: true, sourceNode: node };
    }

    if (node.type === "ExpressionStatement") {
        const expression = Reflect.get(node, "expression");
        if (!expression || typeof expression !== "object") {
            return null;
        }
        const expressionType = Reflect.get(expression, "type");
        if (expressionType !== "AssignmentExpression") {
            return null;
        }
        const right = Reflect.get(expression, "right");
        if (!isFunctionInitializerNode(right)) {
            return null;
        }

        return { functionNode: right, assignmentStyle: true, sourceNode: node };
    }

    if (node.type === "AssignmentExpression") {
        const right = Reflect.get(node, "right");
        if (!isFunctionInitializerNode(right)) {
            return null;
        }

        return { functionNode: right, assignmentStyle: true, sourceNode: node };
    }

    return null;
}

function collectFunctionNodesByStartLine(
    programNode: unknown,
    lineStartOffsets: ReadonlyArray<number>
): Map<number, Array<FunctionLineCandidate>> {
    const nodesByLine = new Map<number, Array<FunctionLineCandidate>>();
    walkAstNodes(programNode, (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        const candidate = getFunctionCandidateForNode(node as AstNodeWithType);
        if (!candidate) {
            return;
        }

        const start = getNodeStartIndex(node as AstNodeWithType);
        if (typeof start !== "number") {
            return;
        }

        const lineIndex = getLineIndexForOffset(lineStartOffsets, start);
        const existing = nodesByLine.get(lineIndex) ?? [];
        existing.push(candidate);
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

function countNamedFunctionParameters(functionNode: AstNodeWithType): number {
    const params = Reflect.get(functionNode, "params");
    if (!Array.isArray(params)) {
        return 0;
    }

    let count = 0;
    for (const param of params) {
        if (!param || typeof param !== "object") {
            continue;
        }

        const paramType = Reflect.get(param, "type");
        if (paramType === "Identifier" && typeof Reflect.get(param, "name") === "string") {
            count += 1;
            continue;
        }

        if (paramType === "DefaultParameter" || paramType === "AssignmentPattern") {
            const left = Reflect.get(param, "left");
            if (left && typeof left === "object") {
                const name = Reflect.get(left, "name");
                const identifier = Reflect.get(left, "id");
                if (
                    typeof name === "string" ||
                    (identifier &&
                        typeof identifier === "object" &&
                        typeof Reflect.get(identifier, "name") === "string")
                ) {
                    count += 1;
                }
            }
            continue;
        }

        if (typeof Reflect.get(param, "name") === "string") {
            count += 1;
        }
    }

    return count;
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

function normalizeParamName(name: string): string {
    return name.replace(/^_+/, "");
}

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

function normalizeDocParamLineParameterName(line: string): string {
    const optionalMatch = /^(\s*\/\/\/\s*@param(?:\s+\{[^}]+\})?\s+)\[([A-Za-z0-9_]+)([^\]]*)\](.*)$/u.exec(line);
    if (optionalMatch) {
        return `${optionalMatch[1]}[${normalizeParamName(optionalMatch[2])}${optionalMatch[3]}]${optionalMatch[4]}`;
    }

    const requiredMatch = /^(\s*\/\/\/\s*@param(?:\s+\{[^}]+\})?\s+)([A-Za-z0-9_]+)(.*)$/u.exec(line);
    if (requiredMatch) {
        return `${requiredMatch[1]}${normalizeParamName(requiredMatch[2])}${requiredMatch[3]}`;
    }

    return line;
}

function collectDocCommentParamTypesByName(docLines: ReadonlyArray<string>): Map<string, string> {
    const typesByName = new Map<string, string>();
    for (const line of docLines) {
        const metadata = parseDocCommentParamMetadata(line);
        if (!metadata || metadata.typeText === null) {
            continue;
        }

        const cleanName = normalizeParamName(metadata.name);
        if (!typesByName.has(cleanName)) {
            typesByName.set(cleanName, metadata.typeText);
        }
    }

    return typesByName;
}

function removeParamDocLinesNotInFunctionSignature(
    docLines: ReadonlyArray<string>,
    functionParameterNames: ReadonlySet<string>
): ReadonlyArray<string> {
    return docLines.filter((line) => {
        const metadata = parseDocCommentParamMetadata(line);
        if (!metadata) {
            return true;
        }

        return functionParameterNames.has(normalizeParamName(metadata.name));
    });
}

function reorderDocParamLinesByFunctionOrder(
    docLines: ReadonlyArray<string>,
    functionParameterNamesInOrder: ReadonlyArray<string>
): ReadonlyArray<string> {
    const parameterOrder = new Map<string, number>();
    for (const [index, name] of functionParameterNamesInOrder.entries()) {
        if (!parameterOrder.has(name)) {
            parameterOrder.set(name, index);
        }
    }

    const paramEntries = docLines
        .map((line, index) => {
            const metadata = parseDocCommentParamMetadata(line);
            if (!metadata) {
                return null;
            }
            return {
                index,
                line,
                name: normalizeParamName(metadata.name)
            };
        })
        .filter((entry): entry is { index: number; line: string; name: string } => entry !== null);

    if (paramEntries.length <= 1) {
        return docLines;
    }

    const sortedEntries = Array.from(paramEntries).toSorted((left, right) => {
        const leftOrder = parameterOrder.get(left.name);
        const rightOrder = parameterOrder.get(right.name);
        const leftKey = leftOrder ?? Number.MAX_SAFE_INTEGER;
        const rightKey = rightOrder ?? Number.MAX_SAFE_INTEGER;
        if (leftKey !== rightKey) {
            return leftKey - rightKey;
        }
        return left.index - right.index;
    });

    const rewritten = Array.from(docLines);
    for (const [orderIndex, originalEntry] of paramEntries.entries()) {
        rewritten[originalEntry.index] = sortedEntries[orderIndex].line;
    }
    return rewritten;
}

type ReturnInferenceSummary = Readonly<{
    hasReturnStatement: boolean;
    hasConcreteReturn: boolean;
    hasUndefinedReturn: boolean;
    concreteReturnType: string | null;
}>;

function isFunctionLikeNodeType(nodeType: string): boolean {
    return (
        nodeType === "FunctionDeclaration" ||
        nodeType === "FunctionExpression" ||
        nodeType === "ConstructorDeclaration" ||
        nodeType === "StructFunctionDeclaration"
    );
}

function isUndefinedReturnArgument(argument: unknown): boolean {
    if (!argument || typeof argument !== "object") {
        return false;
    }

    const argumentType = Reflect.get(argument, "type");
    if (argumentType === "Identifier" && Reflect.get(argument, "name") === "undefined") {
        return true;
    }

    if (argumentType !== "Literal") {
        return false;
    }

    const value = Reflect.get(argument, "value");
    return value === undefined || value === "undefined";
}

function isNumericLiteralText(value: string): boolean {
    return /^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(value.trim());
}

function inferConcreteReturnTypeFromArgument(
    argument: unknown,
    functionParameterNames: ReadonlySet<string>,
    docParamTypesByName: ReadonlyMap<string, string>
): string {
    if (!argument || typeof argument !== "object") {
        return "any";
    }

    const argumentType = Reflect.get(argument, "type");
    if (argumentType === "StructExpression") {
        return "Struct";
    }

    if (argumentType === "Literal") {
        const literalValue = Reflect.get(argument, "value");
        if (typeof literalValue === "number") {
            return "real";
        }

        if (typeof literalValue === "string" && isNumericLiteralText(literalValue)) {
            return "real";
        }

        return "any";
    }

    if (argumentType === "Identifier") {
        const identifierName = Reflect.get(argument, "name");
        if (typeof identifierName !== "string" || identifierName.length === 0) {
            return "any";
        }

        const cleanName = normalizeParamName(identifierName);
        if (!functionParameterNames.has(cleanName)) {
            return "any";
        }

        return docParamTypesByName.get(cleanName) ?? "any";
    }

    return "any";
}

function mergeConcreteReturnType(current: string | null, next: string): string {
    if (current === null) {
        return next;
    }

    if (current === next) {
        return current;
    }

    return "any";
}

function analyzeFunctionReturnInference(
    functionNode: AstNodeWithType,
    functionParameterNames: ReadonlySet<string>,
    docParamTypesByName: ReadonlyMap<string, string>
): ReturnInferenceSummary {
    let hasReturnStatement = false;
    let hasConcreteReturn = false;
    let hasUndefinedReturn = false;
    let concreteReturnType: string | null = null;

    const bodyNode = Reflect.get(functionNode, "body");
    const stack: unknown[] = [];
    if (bodyNode && typeof bodyNode === "object") {
        stack.push(bodyNode);
    }

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== "object") {
            continue;
        }

        if (Array.isArray(current)) {
            for (let index = current.length - 1; index >= 0; index -= 1) {
                stack.push(current[index]);
            }
            continue;
        }

        const currentType = Reflect.get(current, "type");
        if (currentType === "ReturnStatement") {
            hasReturnStatement = true;
            const argument = Reflect.get(current, "argument");
            if (argument == null || isUndefinedReturnArgument(argument)) {
                hasUndefinedReturn = true;
                continue;
            }

            hasConcreteReturn = true;
            const inferredType = inferConcreteReturnTypeFromArgument(
                argument,
                functionParameterNames,
                docParamTypesByName
            );
            concreteReturnType = mergeConcreteReturnType(concreteReturnType, inferredType);
            continue;
        }

        if (typeof currentType === "string" && isFunctionLikeNodeType(currentType)) {
            continue;
        }

        for (const [key, value] of Object.entries(current)) {
            if (key === "parent") {
                continue;
            }

            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return {
        hasReturnStatement,
        hasConcreteReturn,
        hasUndefinedReturn,
        concreteReturnType
    };
}

function inferReturnDocTypeFromFunctionNode(
    functionNode: AstNodeWithType,
    functionParameterNames: ReadonlySet<string>,
    docParamTypesByName: ReadonlyMap<string, string>
): ReturnInferenceSummary {
    return analyzeFunctionReturnInference(functionNode, functionParameterNames, docParamTypesByName);
}

function normalizeReturnTypeForComparison(typeText: string | null): string {
    if (typeof typeText !== "string") {
        return "";
    }

    return typeText.replaceAll(/\s+/gu, "").toLowerCase();
}

function parseReturnDocType(line: string): string | null {
    const match = /^\s*\/\/\/\s*@returns?\s+\{([^}]+)\}/u.exec(line);
    if (!match) {
        return null;
    }

    const typeText = match[1].trim();
    return typeText.length > 0 ? typeText : null;
}

function removeReturnDocLines(docLines: Array<string>): void {
    for (let index = docLines.length - 1; index >= 0; index -= 1) {
        if (/^\s*\/\/\/\s*@returns?/u.test(docLines[index])) {
            docLines.splice(index, 1);
        }
    }
}

function isFunctionDefaultValueText(defaultValueText: string): boolean {
    return /^\s*function\b/u.test(defaultValueText);
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
    functionNode: AstNodeWithType | null,
    allowSynthesisWithoutDocs: boolean,
    assignmentStyle: boolean,
    hasLeadingIndentation: boolean
): ReadonlyArray<string> | null {
    if (!functionNode) {
        return null;
    }

    const name = (functionNode as any).id?.name || "";
    // start with a mutable copy of whatever the user already wrote
    const block = existingLines ? Array.from(existingLines) : [];
    const hadInputDocLines = block.length > 0;
    if (block.length === 0 && !allowSynthesisWithoutDocs) {
        return null;
    }

    // remove any literal placeholder description that simply repeats the name
    for (let i = block.length - 1; i >= 0; i--) {
        if (new RegExp(String.raw`^\s*///\s*@description\s+${name}\s*$`).test(block[i])) {
            block.splice(i, 1);
        }
    }

    const indentation = /^((?:\s*)?)\S?/.exec(block[0] || "")?.[1] || "";

    const params = (functionNode as any).params || [];
    const functionParameterNamesInOrder: Array<string> = [];
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

        functionParameterNamesInOrder.push(normalizeParamName(parameterName));
    }
    const functionParameterNames = new Set(functionParameterNamesInOrder);
    const prunedBlock = removeParamDocLinesNotInFunctionSignature(block, functionParameterNames);
    const reorderedBlock = reorderDocParamLinesByFunctionOrder(prunedBlock, functionParameterNamesInOrder);
    block.splice(0, block.length, ...reorderedBlock);

    // examine what we currently have, so we only add missing lines
    const existingParams = new Set<string>();
    const existingParamTypesByName = collectDocCommentParamTypesByName(block);
    const existingReturnLines = block.filter((line) => /^\s*\/\/\/\s*@returns?/u.test(line));
    let hasReturns = existingReturnLines.length > 0;
    for (const line of block) {
        const metadata = parseDocCommentParamMetadata(line);
        if (metadata) {
            existingParams.add(normalizeParamName(metadata.name));
        }
    }

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
        const cleanName = normalizeParamName(paramName);
        if (existingParams.has(cleanName)) {
            if (defaultVal !== undefined) {
                updateExistingParamDocWithDefault(block, cleanName, defaultVal);
            }
            continue;
        }

        if (defaultVal === undefined) {
            block.push(`${indentation}/// @param ${cleanName}`);
        } else if (isFunctionDefaultValueText(defaultVal)) {
            block.push(`${indentation}/// @param {function} [${cleanName}]`);
        } else {
            block.push(`${indentation}/// @param ${formatOptionalParamDocName(cleanName, defaultVal)}`);
        }
    }

    const returnInference = inferReturnDocTypeFromFunctionNode(
        functionNode,
        functionParameterNames,
        existingParamTypesByName
    );
    const concreteReturnType = returnInference.concreteReturnType ?? "any";
    const inferredReturnType = returnInference.hasConcreteReturn
        ? returnInference.hasUndefinedReturn
            ? `${concreteReturnType}|undefined`
            : concreteReturnType
        : "undefined";

    const suppressUndocumentedAssignmentWithoutParams =
        assignmentStyle && !hadInputDocLines && functionParameterNamesInOrder.length === 0;
    const suppressNestedUndocumentedNoParamConcreteReturn =
        !assignmentStyle &&
        !hadInputDocLines &&
        hasLeadingIndentation &&
        functionParameterNamesInOrder.length === 0 &&
        returnInference.hasConcreteReturn;
    const suppressDocOnlyNoParamConcreteReturn =
        !assignmentStyle &&
        hadInputDocLines &&
        functionParameterNamesInOrder.length === 0 &&
        existingReturnLines.length === 0 &&
        returnInference.hasConcreteReturn;
    const suppressUndocumentedStructReturnForDeclarations =
        !assignmentStyle &&
        !hadInputDocLines &&
        normalizeReturnTypeForComparison(inferredReturnType) === "struct" &&
        returnInference.hasConcreteReturn;

    const shouldSynthesizeReturnLine =
        !suppressUndocumentedAssignmentWithoutParams &&
        !suppressNestedUndocumentedNoParamConcreteReturn &&
        !suppressDocOnlyNoParamConcreteReturn &&
        !suppressUndocumentedStructReturnForDeclarations;

    if (hasReturns && shouldSynthesizeReturnLine) {
        const firstExistingReturnType = parseReturnDocType(existingReturnLines[0] ?? "");
        const normalizedExistingReturnType = normalizeReturnTypeForComparison(firstExistingReturnType);
        const normalizedInferredReturnType = normalizeReturnTypeForComparison(inferredReturnType);
        const shouldReplaceWithInferredUndefined =
            normalizedInferredReturnType === "undefined" &&
            normalizedExistingReturnType !== "undefined" &&
            normalizedExistingReturnType !== "void";
        const shouldReplaceUndefinedPlaceholder =
            normalizedExistingReturnType === "undefined" && normalizedInferredReturnType !== "undefined";
        const shouldReplaceUnstructuredReturn = normalizedExistingReturnType.length === 0;

        if (
            shouldReplaceWithInferredUndefined ||
            shouldReplaceUndefinedPlaceholder ||
            shouldReplaceUnstructuredReturn
        ) {
            removeReturnDocLines(block);
            block.push(`${indentation}/// @returns {${inferredReturnType}}`);
            hasReturns = true;
        }
    }

    if (!hasReturns && shouldSynthesizeReturnLine) {
        block.push(`${indentation}/// @returns {${inferredReturnType}}`);
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
        .map((line) => normalizeDocParamLineParameterName(line))
        .map((line) => normalizeUndefinedOptionalDefaultParamDocLine(line))
        .filter((line) => !emptyDescriptionPattern.test(line))
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
            existingParams.add(normalizeParamName(metadata.name));
        }
    }
    return existingParams;
}

function updateExistingParamDocWithDefault(docBlock: Array<string>, parameterName: string, defaultVal: string): void {
    for (const [index, line] of docBlock.entries()) {
        const paramMatch = new RegExp(
            String.raw`^(\s*///\s*@param(?:\s+\{[^}]+\})?\s+)\[?${parameterName}(?:=[^\]]*)?\]?(.*)$`
        ).exec(line);
        if (!paramMatch) {
            continue;
        }

        docBlock[index] = `${paramMatch[1]}${formatOptionalParamDocName(parameterName, defaultVal)}${paramMatch[2]}`;
        return;
    }
}

function updateExistingFallbackParamWithDefault(
    fallbackBlock: Array<string>,
    parameterName: string,
    defaultVal: string
): void {
    updateExistingParamDocWithDefault(fallbackBlock, parameterName, defaultVal);
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
    const fallbackParamNamesInOrder = fallbackParams.map((parameter) => normalizeParamName(parameter.name));
    const fallbackParamNames = new Set(fallbackParamNamesInOrder);
    const prunedFallbackBlock = removeParamDocLinesNotInFunctionSignature(fallbackBlock, fallbackParamNames);
    const reorderedFallbackBlock = reorderDocParamLinesByFunctionOrder(prunedFallbackBlock, fallbackParamNamesInOrder);
    fallbackBlock.splice(0, fallbackBlock.length, ...reorderedFallbackBlock);

    const existingParams = collectExistingParamNames(fallbackBlock);
    for (const { name, defaultVal } of fallbackParams) {
        const cleanName = normalizeParamName(name);
        if (existingParams.has(cleanName)) {
            if (defaultVal !== undefined) {
                updateExistingFallbackParamWithDefault(fallbackBlock, cleanName, defaultVal);
            }
            continue;
        }

        appendMissingFallbackParamLine(fallbackBlock, indentation, cleanName, defaultVal);
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
                    const deferredDocBlocksByLineIndex = new Map<number, Array<string>>();

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

                        const astFunctionCandidate = functionNodesByLineIndex.get(lineIndex)?.[0] ?? null;
                        const hasAstNode = astFunctionCandidate !== null;
                        // when running under the minimalist test harness the AST will be
                        // just `{type:"Program"}` so the map will be empty; fall back to a
                        // simple regex to recognize function headers in that case.
                        const hasLeadingIndentation = /^\s+/u.test(line);
                        const isTextualFunctionDeclaration = /^\s*function\b/u.test(line);
                        const isTextualFunctionAssignment = /^\s*(?:var|static)\s+[A-Za-z_]\w*\s*=\s*function\b/u.test(
                            line
                        );
                        const isTextualFunction =
                            isTextualFunctionDeclaration ||
                            (isTextualFunctionAssignment && (pendingDocBlock.length > 0 || !hasLeadingIndentation));
                        const isFunctionLine = hasAstNode || isTextualFunction;

                        if (isFunctionLine) {
                            const indentationMatch = /^(\s*)/.exec(line);
                            const indentation = indentationMatch ? indentationMatch[1] : "";

                            const processedBlock = pendingDocBlock.length > 0 ? processDocBlock(pendingDocBlock) : [];
                            const synthesized = astFunctionCandidate
                                ? synthesizeFunctionDocCommentBlock(
                                      processedBlock,
                                      text,
                                      astFunctionCandidate.functionNode,
                                      !astFunctionCandidate.assignmentStyle || !hasLeadingIndentation,
                                      astFunctionCandidate.assignmentStyle,
                                      hasLeadingIndentation
                                  )
                                : synthesizeTextFallbackDocCommentBlock({
                                      processedBlock,
                                      line,
                                      indentation,
                                      lines,
                                      lineIndex
                                  });

                            let deferredSynthesisHandled = false;
                            if (
                                astFunctionCandidate &&
                                synthesized &&
                                synthesized.length > 0 &&
                                astFunctionCandidate.assignmentStyle &&
                                !hasLeadingIndentation &&
                                processedBlock.length === 0 &&
                                countNamedFunctionParameters(astFunctionCandidate.functionNode) > 0
                            ) {
                                const assignmentReturnSummary = inferReturnDocTypeFromFunctionNode(
                                    astFunctionCandidate.functionNode,
                                    new Set<string>(),
                                    new Map<string, string>()
                                );
                                if (!assignmentReturnSummary.hasReturnStatement) {
                                    const assignmentStartIndex = getNodeStartIndex(astFunctionCandidate.sourceNode);
                                    const assignmentEndIndex = getNodeEndIndex(astFunctionCandidate.sourceNode);
                                    if (
                                        typeof assignmentStartIndex === "number" &&
                                        typeof assignmentEndIndex === "number" &&
                                        assignmentEndIndex > assignmentStartIndex
                                    ) {
                                        let assignmentSliceEndIndex = assignmentEndIndex;
                                        if (text[assignmentSliceEndIndex] === ";") {
                                            assignmentSliceEndIndex += 1;
                                        }

                                        const assignmentText = text.slice(
                                            assignmentStartIndex,
                                            assignmentSliceEndIndex
                                        );
                                        const assignmentLines = assignmentText.split(/\r?\n/u);
                                        const assignmentEndLineIndex = getLineIndexForOffset(
                                            lineStartOffsets,
                                            assignmentEndIndex - 1
                                        );
                                        const deferredLines = ["", ...synthesized, ...assignmentLines];
                                        const existingDeferredLines =
                                            deferredDocBlocksByLineIndex.get(assignmentEndLineIndex) ?? [];
                                        existingDeferredLines.push(...deferredLines);
                                        deferredDocBlocksByLineIndex.set(assignmentEndLineIndex, existingDeferredLines);
                                        deferredSynthesisHandled = true;
                                    }
                                }
                            }

                            if (synthesized && synthesized.length > 0) {
                                if (!deferredSynthesisHandled) {
                                    rewrittenLines.push(...synthesized);
                                }
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
                        const deferredDocBlock = deferredDocBlocksByLineIndex.get(lineIndex);
                        if (deferredDocBlock && deferredDocBlock.length > 0) {
                            rewrittenLines.push(...deferredDocBlock);
                        }
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
