import { walkObjectGraph } from "../ast/object-graph.js";
import { isCommentNode } from "@gml-modules/core";

export function transform(ast, opts = {}) {
    const cfg = Object.assign(
        {
            stripComments: true,
            stripJsDoc: true,
            dropCommentedOutCode: false
        },
        opts
    );

    if (!ast || typeof ast !== "object") {
        return ast;
    }

    // Remove comment nodes from any comments arrays and delete doc-like
    // metadata fields when requested.
    walkObjectGraph(ast, {
        enterObject(value) {
            if (!value || typeof value !== "object") {
                return;
            }

            if (cfg.stripComments) {
                if (Array.isArray(value.comments)) {
                    // Keep any non-comment entries (defensive) but strip known
                    // comment node shapes.
                    value.comments = value.comments.filter(
                        (c) => !isCommentNode(c)
                    );
                    if (value.comments.length === 0) {
                        delete value.comments;
                    }
                }

                if (Array.isArray(value.docComments)) {
                    delete value.docComments;
                }
            }

            if (cfg.stripJsDoc) {
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

    // Also clear the top-level comments collection if present.
    if (cfg.stripComments && Array.isArray(ast.comments)) {
        ast.comments = [];
    }

    return ast;
}

export default { transform };
