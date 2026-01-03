/**
 * Provides a configurable transform that can remove comments or JSDoc before formatting/printing.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { createParserTransform } from "./functional-transform.js";

type StripCommentsTransformOptions = {
    stripComments: boolean;
    stripJsDoc: boolean;
    dropCommentedOutCode: boolean;
};

/**
 * Removes comment nodes and related metadata according to the caller's options.
 */
function execute(ast: any, options: StripCommentsTransformOptions): MutableGameMakerAstNode {
    // Walk the AST and drop comment-related properties as requested by the options.
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    Core.walkObjectGraph(ast, {
        enterObject(value) {
            if (!value || typeof value !== "object") {
                return;
            }

            if (options.stripComments) {
                const comments = (value as any).comments;
                if (Array.isArray(comments)) {
                    const filtered = comments.filter((c) => !Core.isCommentNode(c));
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

            if (options.stripJsDoc) {
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

    if (options.stripComments && Array.isArray(ast.comments)) {
        ast.comments = [];
    }

    return ast;
}

export const stripCommentsTransform = createParserTransform<StripCommentsTransformOptions>(
    "strip-comments",
    {
        stripComments: true,
        stripJsDoc: true,
        dropCommentedOutCode: false
    },
    execute
);

export default { stripCommentsTransform };
