import { Core } from "@gml-modules/core";

type NodeWithDocComments = {
    type?: string;
    declarations?: unknown[];
    docComments?: unknown[];
};

type CommentNodeWithAttachmentFlag = {
    type?: string;
    value?: string;
    _gmlAttachedDocComment?: boolean;
};

type FunctionDocTarget = {
    node: NodeWithDocComments;
    startIndex: number;
};

function isFunctionDocTagComment(comment: unknown): comment is CommentNodeWithAttachmentFlag {
    if (!Core.isObjectLike(comment)) {
        return false;
    }

    const commentNode = comment as { type?: unknown; value?: unknown };
    if (commentNode.type !== "CommentLine" || typeof commentNode.value !== "string") {
        return false;
    }

    return /@(?:function|func)\b/i.test(commentNode.value);
}

function isFunctionLikeInitializer(initializer: unknown): boolean {
    if (!Core.isObjectLike(initializer)) {
        return false;
    }

    const initializerType = (initializer as { type?: string }).type;
    if (initializerType === "FunctionDeclaration" || initializerType === "ConstructorDeclaration") {
        return true;
    }

    if (initializerType === "ParenthesizedExpression") {
        return isFunctionLikeInitializer((initializer as { expression?: unknown }).expression);
    }

    return false;
}

function isFunctionInitializedVariableDeclaration(node: NodeWithDocComments): boolean {
    if (node.type !== "VariableDeclaration" || !Array.isArray(node.declarations) || node.declarations.length !== 1) {
        return false;
    }

    const declarator = node.declarations[0] as { init?: unknown } | undefined;
    if (!declarator || !Core.isObjectLike(declarator)) {
        return false;
    }

    return isFunctionLikeInitializer(declarator.init);
}

function isFunctionDocTargetNode(node: unknown): node is NodeWithDocComments {
    if (!Core.isObjectLike(node)) {
        return false;
    }

    const nodeType = (node as { type?: string }).type;
    if (nodeType === "FunctionDeclaration" || nodeType === "ConstructorDeclaration") {
        return true;
    }

    return isFunctionInitializedVariableDeclaration(node as NodeWithDocComments);
}

function collectFunctionDocTargets(rootNode: unknown): FunctionDocTarget[] {
    const targets: FunctionDocTarget[] = [];
    const visitedNodes = new Set<unknown>();

    const visitNode = (value: unknown): void => {
        if (!value || visitedNodes.has(value)) {
            return;
        }

        if (Array.isArray(value)) {
            visitedNodes.add(value);
            for (const item of value) {
                visitNode(item);
            }
            return;
        }

        if (!Core.isObjectLike(value)) {
            return;
        }

        visitedNodes.add(value);

        if (isFunctionDocTargetNode(value)) {
            const startIndex = Core.getNodeStartIndex(value);
            if (typeof startIndex === "number") {
                targets.push({ node: value, startIndex });
            }
        }

        for (const [key, child] of Object.entries(value)) {
            if (key === "start" || key === "end" || key === "comments" || key === "docComments") {
                continue;
            }
            visitNode(child);
        }
    };

    visitNode(rootNode);

    targets.sort((left, right) => left.startIndex - right.startIndex);
    return targets;
}

function isWhitespaceCharacter(character: string): boolean {
    return character.trim() === "";
}

function containsOnlyWhitespaceAndComments(sourceText: string, startIndex: number, endIndexExclusive: number): boolean {
    let cursor = startIndex;

    while (cursor < endIndexExclusive) {
        const currentCharacter = sourceText[cursor];

        if (isWhitespaceCharacter(currentCharacter)) {
            cursor += 1;
            continue;
        }

        if (currentCharacter === "/" && cursor + 1 < endIndexExclusive) {
            const nextCharacter = sourceText[cursor + 1];

            if (nextCharacter === "/") {
                cursor += 2;
                while (cursor < endIndexExclusive && sourceText[cursor] !== "\n" && sourceText[cursor] !== "\r") {
                    cursor += 1;
                }
                continue;
            }

            if (nextCharacter === "*") {
                cursor += 2;
                while (
                    cursor + 1 < endIndexExclusive &&
                    (sourceText[cursor] !== "*" || sourceText[cursor + 1] !== "/")
                ) {
                    cursor += 1;
                }

                if (cursor + 1 < endIndexExclusive) {
                    cursor += 2;
                } else {
                    cursor = endIndexExclusive;
                }
                continue;
            }
        }

        return false;
    }

    return true;
}

function findNearestReachableFunctionDocTarget(
    targets: FunctionDocTarget[],
    commentEndIndexExclusive: number,
    sourceText: string
): FunctionDocTarget | null {
    for (const target of targets) {
        if (target.startIndex < commentEndIndexExclusive) {
            continue;
        }

        if (!containsOnlyWhitespaceAndComments(sourceText, commentEndIndexExclusive, target.startIndex)) {
            return null;
        }

        return target;
    }

    return null;
}

function attachFunctionDocCommentToTarget(comment: CommentNodeWithAttachmentFlag, target: FunctionDocTarget): void {
    const targetNode = target.node;
    if (!Array.isArray(targetNode.docComments)) {
        targetNode.docComments = [];
    }

    const alreadyAttached = targetNode.docComments.includes(comment);
    if (!alreadyAttached) {
        targetNode.docComments.push(comment);
    }

    comment._gmlAttachedDocComment = true;
}

/**
 * Performs parser-owned normalization for `@function` / `@func` doc comments.
 *
 * The formatter should not repair misattached doc-comments. This pass runs in
 * the parser after AST construction and pre-attaches function-tag comments to
 * the nearest reachable function-like declaration node.
 *
 * @param rootNode - Parsed AST root node.
 * @param comments - Parser-extracted comment node list.
 * @param sourceText - Parser source text used for location offsets.
 */
export function normalizeFunctionDocCommentAttachments(
    rootNode: unknown,
    comments: unknown[],
    sourceText: string
): void {
    if (!Array.isArray(comments) || comments.length === 0 || typeof sourceText !== "string") {
        return;
    }

    const targets = collectFunctionDocTargets(rootNode);
    if (targets.length === 0) {
        return;
    }

    for (const comment of comments) {
        if (!isFunctionDocTagComment(comment)) {
            continue;
        }

        const commentEndIndexExclusive = Core.getNodeEndIndex(comment);
        if (typeof commentEndIndexExclusive !== "number") {
            continue;
        }

        const target = findNearestReachableFunctionDocTarget(targets, commentEndIndexExclusive, sourceText);
        if (!target) {
            continue;
        }

        attachFunctionDocCommentToTarget(comment, target);
    }
}
