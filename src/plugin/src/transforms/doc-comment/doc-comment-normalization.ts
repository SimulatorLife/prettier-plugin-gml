import {
    Core,
    type MutableDocCommentLines,
    type MutableGameMakerAstNode
} from "@gml-modules/core";
import { createParserTransform } from "../functional-transform.js";
import { walkAstNodes } from "../feather/ast-traversal.js";
import { resolveDocCommentPrinterOptions } from "../../printer/doc-comment/doc-comment-options.js";
import {
    applyDescriptionContinuations,
    collectDescriptionContinuations
} from "./description-utils.js";
import { setDocCommentNormalization } from "./normalization-utils.js";
import {
    setDocCommentMetadata,
    setDeprecatedDocCommentFunctionSet
} from "./doc-comment-metadata.js";
import { removeFunctionDocCommentLines } from "../../doc-comment/function-tag-filter.js";
import { normalizeDocLikeLineComment } from "../../comments/doc-like-line-normalization.js";

type DocCommentNormalizationTransformOptions = {
    enabled?: boolean;
    pluginOptions?: Record<string, unknown>;
};

type DocCommentPath = {
    getValue(): MutableGameMakerAstNode | null;
    getParentNode(): MutableGameMakerAstNode | null;
};

function createDocCommentPath(
    node: MutableGameMakerAstNode,
    parent?: MutableGameMakerAstNode | null
): DocCommentPath {
    return {
        getValue() {
            return node;
        },
        getParentNode() {
            return parent ?? null;
        }
    };
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

    const parentByNode = new WeakMap<
        MutableGameMakerAstNode,
        MutableGameMakerAstNode
    >();
    walkAstNodes(ast, (node, parent) => {
        if (!Core.isNode(node) || !Core.isNode(parent)) {
            return;
        }
        parentByNode.set(
            node as MutableGameMakerAstNode,
            parent as MutableGameMakerAstNode
        );
    });

    const traversal = Core.resolveDocCommentTraversalService(ast);
    // Pass null for sourceText to force using AST comment values, which may have been updated
    const documentedParamNamesByFunction = Core.buildDocumentedParamNameLookup(
        ast,
        null,
        traversal
    );
    const deprecatedFunctionNames = Core.collectDeprecatedFunctionNames(
        ast,
        null,
        traversal
    );

    setDeprecatedDocCommentFunctionSet(ast, deprecatedFunctionNames);

    traversal.forEach((node, comments = []) => {
        const mutableNode = node as MutableGameMakerAstNode;
        if (!Core.isFunctionLikeNode(mutableNode)) {
            return;
        }

        const formattedLines: string[] = [];
        for (const comment of comments ?? []) {
            const formatted = Core.formatLineComment(
                comment,
                lineCommentOptions
            );
            const normalized =
                typeof formatted === "string"
                    ? normalizeDocLikeLineComment(
                          comment,
                          formatted,
                          lineCommentOptions.originalText
                      )
                    : formatted;
            if (!Core.isNonEmptyTrimmedString(normalized)) {
                continue;
            }

            if (!Core.isLineCommentDocLike(normalized)) {
                continue;
            }

            formattedLines.push(normalized);
        }

        const filteredDocLines = formattedLines;

        const docPath = createDocCommentPath(
            mutableNode,
            parentByNode.get(mutableNode) ?? null
        );

        if (
            !Core.shouldGenerateSyntheticDocForFunction(
                docPath,
                filteredDocLines,
                docCommentOptions
            )
        ) {
            return;
        }

        const descriptionContinuations =
            collectDescriptionContinuations(filteredDocLines);

        let normalizedDocComments = Core.toMutableArray(
            Core.mergeSyntheticDocComments(
                node,
                filteredDocLines,
                docCommentOptions
            )
        ) as MutableDocCommentLines;

        normalizedDocComments = applyDescriptionContinuations(
            normalizedDocComments,
            descriptionContinuations
        );

        while (
            normalizedDocComments.length > 0 &&
            typeof normalizedDocComments[0] === "string" &&
            normalizedDocComments[0].trim() === ""
        ) {
            normalizedDocComments.shift();
        }

        normalizedDocComments = removeFunctionDocCommentLines(
            normalizedDocComments
        );

        if (normalizedDocComments.length === 0) {
            return;
        }

        const parentNode = parentByNode.get(node) ?? null;
        const needsLeadingBlankLine = Boolean(
            parentNode && parentNode.type === "BlockStatement"
        );

        const metadata: {
            documentedParamNames?: Set<string>;
            hasDeprecatedDocComment?: boolean;
        } = {};

        const documentedParamNames =
            documentedParamNamesByFunction.get(mutableNode);

        if (documentedParamNames && documentedParamNames.size > 0) {
            metadata.documentedParamNames = documentedParamNames;
        }

        const nodeName = Core.getNodeName(mutableNode);
        if (nodeName && deprecatedFunctionNames.has(nodeName)) {
            metadata.hasDeprecatedDocComment = true;
        }

        const hasMetadata =
            metadata.documentedParamNames !== undefined ||
            metadata.hasDeprecatedDocComment === true;

        setDocCommentMetadata(node, hasMetadata ? metadata : null);

        setDocCommentNormalization(node, {
            docCommentDocs: normalizedDocComments,
            needsLeadingBlankLine
        });
    });

    return ast;
}

export const docCommentNormalizationTransform =
    createParserTransform<DocCommentNormalizationTransformOptions>(
        "doc-comment-normalization",
        {
            enabled: true,
            pluginOptions: {}
        },
        execute
    );
