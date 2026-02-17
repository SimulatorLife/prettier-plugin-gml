import { Core } from "@gml-modules/core";
import { type Doc } from "prettier";

import { hardline, join } from "../prettier-doc-builders.js";

const { isObjectLike } = Core;

export type SyntheticDocCommentPayload = {
    doc: Doc | null;
    docLines: string[] | null;
    hasExistingDocLines: boolean;
    plainLeadingLines: Doc[];
};

function readNodeStartIndex(node: unknown): number | null {
    if (!isObjectLike(node)) {
        return null;
    }

    const start = (node as { start?: unknown }).start;
    if (typeof start === "number") {
        return start;
    }

    if (isObjectLike(start) && typeof (start as { index?: unknown }).index === "number") {
        return (start as { index: number }).index;
    }

    return null;
}

function collectLeadingDocCommentLinesFromSource(sourceText: string, nodeStartIndex: number): string[] {
    const precedingText = sourceText.slice(0, nodeStartIndex);
    const lines = precedingText.split(/\r?\n/u);
    const collected: string[] = [];
    let index = lines.length - 1;

    while (index >= 0 && lines[index].trim().length === 0) {
        index -= 1;
    }

    while (index >= 0) {
        const line = lines[index].trimEnd();
        if (/^\s*\/\/\/(?:\s|$)/u.test(line)) {
            collected.unshift(line);
            index -= 1;
            continue;
        }

        break;
    }

    return collected;
}

function resolveExistingDocCommentPayload(
    node: unknown,
    sourceText: string | null | undefined
): SyntheticDocCommentPayload | null {
    if (typeof sourceText !== "string") {
        return null;
    }

    const nodeStartIndex = readNodeStartIndex(node);
    if (nodeStartIndex === null || nodeStartIndex < 0 || nodeStartIndex > sourceText.length) {
        return null;
    }

    const docLines = collectLeadingDocCommentLinesFromSource(sourceText, nodeStartIndex);
    if (!Core.isNonEmptyArray(docLines)) {
        return null;
    }

    return {
        doc: join(hardline, docLines),
        docLines,
        hasExistingDocLines: true,
        plainLeadingLines: []
    };
}

function isStaticFunctionVariableDeclaration(node: unknown): boolean {
    if (!isObjectLike(node) || (node as { type?: unknown }).type !== "VariableDeclaration") {
        return false;
    }

    if ((node as { kind?: unknown }).kind !== "static") {
        return false;
    }

    const declarations = (node as { declarations?: unknown }).declarations;
    if (!Array.isArray(declarations) || declarations.length !== 1 || !isObjectLike(declarations[0])) {
        return false;
    }

    const initializerType = (declarations[0] as { init?: { type?: unknown } }).init?.type;
    return initializerType === "FunctionExpression" || initializerType === "FunctionDeclaration";
}

function isFunctionAssignmentLikeStatement(node: unknown): boolean {
    if (!isObjectLike(node)) {
        return false;
    }

    const statement = node as { type?: unknown; expression?: unknown; declarations?: unknown };

    if (statement.type === "VariableDeclaration") {
        const declarations = statement.declarations;
        if (!Array.isArray(declarations) || declarations.length !== 1 || !isObjectLike(declarations[0])) {
            return false;
        }

        const declaration = declarations[0] as { id?: { type?: unknown }; init?: { type?: unknown } };
        const initializerType = declaration.init?.type;
        return (
            declaration.id?.type === "Identifier" &&
            (initializerType === "FunctionExpression" ||
                initializerType === "FunctionDeclaration" ||
                initializerType === "ConstructorDeclaration")
        );
    }

    const assignmentNode =
        statement.type === "ExpressionStatement" && isObjectLike(statement.expression)
            ? (statement.expression as { type?: unknown; operator?: unknown; right?: { type?: unknown } })
            : statement.type === "AssignmentExpression"
              ? (statement as { type?: unknown; operator?: unknown; right?: { type?: unknown } })
              : null;

    if (!assignmentNode || assignmentNode.type !== "AssignmentExpression" || assignmentNode.operator !== "=") {
        return false;
    }

    const rightType = assignmentNode.right?.type;
    return (
        rightType === "FunctionExpression" ||
        rightType === "FunctionDeclaration" ||
        rightType === "ConstructorDeclaration"
    );
}

export function getSyntheticDocCommentForStaticVariable(
    node: unknown,
    options: Record<string, unknown>,
    programNode: unknown,
    sourceText: string | null | undefined
): SyntheticDocCommentPayload | null {
    void options;
    void programNode;
    if (!isStaticFunctionVariableDeclaration(node)) {
        return null;
    }

    return resolveExistingDocCommentPayload(node, sourceText);
}

export function getSyntheticDocCommentForFunctionAssignment(
    node: unknown,
    options: Record<string, unknown>,
    programNode: unknown,
    sourceText: string | null | undefined
): SyntheticDocCommentPayload | null {
    void options;
    void programNode;
    if (!isFunctionAssignmentLikeStatement(node)) {
        return null;
    }

    return resolveExistingDocCommentPayload(node, sourceText);
}
