/**
 * Provides a configurable transform that can remove comments or JSDoc before formatting/printing.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import type { ParserTransform } from "./functional-transform.js";

type StripCommentsTransformOptions = {
    stripComments: boolean;
    stripJsDoc: boolean;
    dropCommentedOutCode: boolean;
};

/**
 * Removes comment nodes and related metadata according to the caller's options.
 */
export class StripCommentsTransform
    implements
        ParserTransform<MutableGameMakerAstNode, StripCommentsTransformOptions>
{
    public readonly name = "strip-comments";
    public readonly defaultOptions = Object.freeze({
        stripComments: true,
        stripJsDoc: true,
        dropCommentedOutCode: false
    }) as StripCommentsTransformOptions;

    public transform(
        ast: MutableGameMakerAstNode,
        options?: StripCommentsTransformOptions
    ): MutableGameMakerAstNode {
        const resolvedOptions = options
            ? { ...this.defaultOptions, ...options }
            : this.defaultOptions;

        // Walk the AST and drop comment-related properties as requested by the options.
        if (!ast || typeof ast !== "object") {
            return ast;
        }

        Core.walkObjectGraph(ast, {
            enterObject(value) {
                if (!value || typeof value !== "object") {
                    return;
                }

                if (resolvedOptions.stripComments) {
                    const comments = (value as any).comments;
                    if (Array.isArray(comments)) {
                        const filtered = comments.filter(
                            (c) => !Core.isCommentNode(c)
                        );
                        if (filtered.length === 0) {
                            delete (value as any).comments;
                        } else {
                            (value as any).comments = filtered;
                        }
                    }

                    if (Array.isArray(value.docComments)) {
                        delete value.docComments;
                    }
                }

                if (resolvedOptions.stripJsDoc) {
                    if (Object.hasOwn(value, "doc")) {
                        delete value.doc;
                    }
                    if (Object.hasOwn(value, "docComment")) {
                        delete value.docComment;
                    }
                    if (Object.hasOwn(value, "jsdoc")) {
                        delete value.jsdoc;
                    }
                }

                return true;
            }
        });

        if (resolvedOptions.stripComments && Array.isArray(ast.comments)) {
            ast.comments = [];
        }

        return ast;
    }
}

export const stripCommentsTransform = new StripCommentsTransform();

export default { stripCommentsTransform };
