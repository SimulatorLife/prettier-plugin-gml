import { Core, type MutableDocCommentLines, type MutableGameMakerAstNode } from "@gml-modules/core";

import { formatDocLikeLineComment } from "../../comments/index.js";
import { removeFunctionDocCommentLines, resolveDocCommentPrinterOptions } from "../../doc-comment/index.js";
import { createParserTransform } from "../functional-transform.js";
import {
    applyDescriptionContinuations,
    collectDescriptionContinuations,
    ensureDescriptionContinuations
} from "./description-utils.js";
import { setDeprecatedDocCommentFunctionSet, setDocCommentMetadata } from "./doc-comment-metadata.js";
import { setDocCommentNormalization } from "./normalization-utils.js";

type DocCommentNormalizationTransformOptions = {
    enabled?: boolean;
    pluginOptions?: Record<string, unknown>;
};

function isStaticFirstStatementInAncestorBlock(
    node: MutableGameMakerAstNode,
    parentByNode: WeakMap<MutableGameMakerAstNode, MutableGameMakerAstNode>
) {
    let child: MutableGameMakerAstNode | undefined | null = node;
    let ancestor = parentByNode.get(node) ?? null;

    while (ancestor && ancestor.type !== "BlockStatement") {
        child = ancestor;
        ancestor = parentByNode.get(child) ?? null;
    }

    if (!ancestor || !Array.isArray((ancestor as any).body) || (ancestor as any).body.length === 0) {
        return false;
    }

    const firstStatement = (ancestor as any).body[0];
    if (firstStatement !== child) {
        return false;
    }

    return firstStatement?.type === "VariableDeclaration" && firstStatement?.kind === "static";
}

function findDocCommentHostAncestor(
    node: MutableGameMakerAstNode,
    parentByNode: WeakMap<MutableGameMakerAstNode, MutableGameMakerAstNode>
) {
    let ancestor = parentByNode.get(node) ?? null;

    while (ancestor) {
        if (ancestor.type === "Program" || ancestor.type === "BlockStatement") {
            return ancestor;
        }
        ancestor = parentByNode.get(ancestor) ?? null;
    }

    return null;
}

function execute(
    ast: MutableGameMakerAstNode,
    options: DocCommentNormalizationTransformOptions
): MutableGameMakerAstNode {
    if (options.enabled === false) {
        return ast;
    }

    const pluginOptions = options.pluginOptions ?? {};
    const lineCommentOptions = {
        ...Core.resolveLineCommentOptions(pluginOptions),
        // Force using AST values to respect previous transforms (e.g. Feather fixes)
        originalText: null
    };
    const docCommentOptions = resolveDocCommentPrinterOptions(pluginOptions);

    const parentByNode = new WeakMap<MutableGameMakerAstNode, MutableGameMakerAstNode>();
    const walkWithParents = (node: unknown, parent: MutableGameMakerAstNode | null) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const entry of node) {
                walkWithParents(entry, parent);
            }
            return;
        }

        const candidate = node as MutableGameMakerAstNode;
        if (parent) {
            parentByNode.set(candidate, parent);
        }

        for (const value of Object.values(candidate)) {
            if (!value || typeof value !== "object") {
                continue;
            }
            walkWithParents(value, candidate);
        }
    };

    walkWithParents(ast, null);

    const traversal = Core.resolveDocCommentTraversalService(ast);
    // Pass null for sourceText to force using AST comment values, which may have been updated
    const documentedParamNamesByFunction = Core.buildDocumentedParamNameLookup(ast, null, traversal);
    const deprecatedFunctionNames = Core.collectDeprecatedFunctionNames(ast, null, traversal);

    setDeprecatedDocCommentFunctionSet(ast, deprecatedFunctionNames);

    traversal.forEach((node, comments = []) => {
        const mutableNode = node as MutableGameMakerAstNode;
        if (!Core.isFunctionLikeNode(mutableNode)) {
            return;
        }

        const formattedLines: string[] = [];
        for (const comment of comments ?? []) {
            const normalized = formatDocLikeLineComment(comment, lineCommentOptions, lineCommentOptions.originalText);
            if (!Core.isNonEmptyTrimmedString(normalized)) {
                continue;
            }

            if (!Core.isLineCommentDocLike(normalized)) {
                continue;
            }

            formattedLines.push(normalized);
        }

        const filteredDocLines = formattedLines;
        ensureDescriptionContinuations(filteredDocLines);

        const docHostAncestor = findDocCommentHostAncestor(mutableNode, parentByNode);
        const parent = parentByNode.get(mutableNode) ?? null;

        const shouldGenerate = Core.shouldGenerateSyntheticDocForFunction(
            mutableNode,
            parent,
            filteredDocLines,
            docCommentOptions
        );
        if (!shouldGenerate) {
            return;
        }

        const descriptionContinuations = collectDescriptionContinuations(filteredDocLines);

        const merged = Core.mergeSyntheticDocComments(node, filteredDocLines, docCommentOptions);

        let normalizedDocComments = Core.toMutableArray(merged) as MutableDocCommentLines;

        if ((merged as any)._preserveDescriptionBreaks === true) {
            (normalizedDocComments as any)._preserveDescriptionBreaks = true;
        }
        if ((merged as any)._suppressLeadingBlank === true) {
            (normalizedDocComments as any)._suppressLeadingBlank = true;
        }
        if ((merged as any)._blockCommentDocs === true) {
            (normalizedDocComments as any)._blockCommentDocs = true;
        }

        normalizedDocComments = applyDescriptionContinuations(normalizedDocComments, descriptionContinuations);

        while (
            normalizedDocComments.length > 0 &&
            typeof normalizedDocComments[0] === "string" &&
            normalizedDocComments[0].trim() === ""
        ) {
            normalizedDocComments.shift();
        }

        normalizedDocComments = removeFunctionDocCommentLines(normalizedDocComments);

        if (normalizedDocComments.length === 0) {
            return;
        }

        const needsLeadingBlankLine = Boolean(docHostAncestor && docHostAncestor.type === "BlockStatement");

        const metadata: {
            documentedParamNames?: Set<string>;
            hasDeprecatedDocComment?: boolean;
        } = {};

        const documentedParamNames = documentedParamNamesByFunction.get(mutableNode);

        if (documentedParamNames && documentedParamNames.size > 0) {
            metadata.documentedParamNames = documentedParamNames;
        }

        const nodeName = Core.getNodeName(mutableNode);
        if (nodeName && deprecatedFunctionNames.has(nodeName)) {
            metadata.hasDeprecatedDocComment = true;
        }

        const hasMetadata = metadata.documentedParamNames !== undefined || metadata.hasDeprecatedDocComment === true;

        setDocCommentMetadata(node, hasMetadata ? metadata : null);

        const shouldSuppressLeadingBlank =
            needsLeadingBlankLine && isStaticFirstStatementInAncestorBlock(mutableNode, parentByNode);

        setDocCommentNormalization(node, {
            docCommentDocs: normalizedDocComments,
            needsLeadingBlankLine,
            _preserveDescriptionBreaks: (normalizedDocComments as any)._preserveDescriptionBreaks,
            _suppressLeadingBlank:
                shouldSuppressLeadingBlank || (normalizedDocComments as any)._suppressLeadingBlank === true
        } as any);
    });

    return ast;
}

export const docCommentNormalizationTransform = createParserTransform<DocCommentNormalizationTransformOptions>(
    "doc-comment-normalization",
    {
        enabled: true,
        pluginOptions: {}
    },
    execute
);
