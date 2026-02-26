import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import {
    computeSyntheticDocCommentForFunctionAssignment,
    computeSyntheticDocCommentForStaticVariable
} from "./synthetic-comments.js";

const { isObjectLike } = Core;

const FUNCTION_INITIALIZER_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ConstructorDeclaration"]);

type SyntheticDocCommentCache = {
    docLines: string[] | null;
    hasExistingDocLines: boolean;
    plainLeadingLines: string[];
};

type SyntheticDocResult = {
    docLines: string[] | null;
    hasExistingDocLines: boolean;
    plainLeadingLines: string[];
} | null;

function snapshotPrintedFlags(programNode: MutableGameMakerAstNode): Map<object, boolean> {
    const snapshot = new Map<object, boolean>();
    const comments = Core.getCommentArray(programNode);

    for (const comment of comments) {
        if (!isObjectLike(comment)) {
            continue;
        }

        const commentRecord = comment as { printed?: unknown };
        const printed = "printed" in commentRecord && commentRecord.printed === true;
        snapshot.set(comment as object, printed);
    }

    return snapshot;
}

function restorePrintedFlags(snapshot: Map<object, boolean>): void {
    for (const [comment, printed] of snapshot) {
        try {
            Reflect.set(comment, "printed", printed);
        } catch {
            // Best-effort only.
        }
    }
}

function computeSyntheticDocSafely<T>(programNode: MutableGameMakerAstNode, compute: () => T): T | null {
    const snapshot = snapshotPrintedFlags(programNode);
    const result = compute();

    if (result == null) {
        restorePrintedFlags(snapshot);
        return null;
    }

    return result;
}

function isFunctionInitializerType(node: { type?: string } | null | undefined): boolean {
    return FUNCTION_INITIALIZER_TYPES.has(node?.type ?? "");
}

function isStaticFunctionDeclaration(node: MutableGameMakerAstNode): boolean {
    if (node.type !== "VariableDeclaration" || node.kind !== "static") {
        return false;
    }

    if (!Array.isArray((node as any).declarations) || (node as any).declarations.length !== 1) {
        return false;
    }

    const declarator = (node as any).declarations[0];
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return false;
    }

    if (declarator.id?.type !== "Identifier") {
        return false;
    }

    return isFunctionInitializerType(declarator.init);
}

function isFunctionAssignmentCandidate(node: MutableGameMakerAstNode): boolean {
    if (node.type === "VariableDeclaration") {
        if (!Array.isArray((node as any).declarations) || (node as any).declarations.length !== 1) {
            return false;
        }

        const declarator = (node as any).declarations[0];
        if (!declarator || declarator.type !== "VariableDeclarator") {
            return false;
        }

        if (declarator.id?.type !== "Identifier") {
            return false;
        }

        return isFunctionInitializerType(declarator.init);
    }

    if (node.type === "ExpressionStatement") {
        const expression = (node as any).expression;
        if (!expression || expression.type !== "AssignmentExpression") {
            return false;
        }

        return isFunctionInitializerType(expression.right);
    }

    if (node.type === "AssignmentExpression") {
        return isFunctionInitializerType((node as any).right);
    }

    return false;
}

function cacheSyntheticDocComment(node: MutableGameMakerAstNode, result: SyntheticDocResult): void {
    if (!result) {
        return;
    }

    const docLines = Core.isNonEmptyArray(result.docLines) ? Core.toMutableArray(result.docLines) : null;
    const plainLeadingLines = Core.asArray(result.plainLeadingLines).filter(
        (line): line is string => typeof line === "string"
    );

    const cache: SyntheticDocCommentCache = {
        docLines,
        hasExistingDocLines: result.hasExistingDocLines === true,
        plainLeadingLines
    };

    try {
        Reflect.set(node, "_gmlSyntheticDocComment", cache);
    } catch {
        // Best-effort only; the printer can still recompute when needed.
    }

    if (docLines) {
        try {
            Reflect.set(node, "_syntheticDocLines", docLines);
        } catch {
            // Best-effort only.
        }
    }
}

export function precomputeSyntheticDocComments(
    ast: MutableGameMakerAstNode,
    options: Record<string, unknown> = {},
    sourceText: string | null = null
): MutableGameMakerAstNode {
    if (!isObjectLike(ast)) {
        return ast;
    }

    const programNode = ast;

    Core.walkAst(ast, (node) => {
        if (!isObjectLike(node)) {
            return;
        }

        if (isStaticFunctionDeclaration(node)) {
            const result = computeSyntheticDocSafely(programNode, () =>
                computeSyntheticDocCommentForStaticVariable(node, options, programNode, sourceText)
            );
            cacheSyntheticDocComment(node, result);
            return false;
        }

        if (!isFunctionAssignmentCandidate(node)) {
            return;
        }

        const result = computeSyntheticDocSafely(programNode, () =>
            computeSyntheticDocCommentForFunctionAssignment(node, options, programNode, sourceText)
        );
        cacheSyntheticDocComment(node, result);
        return false;
    });

    return ast;
}
