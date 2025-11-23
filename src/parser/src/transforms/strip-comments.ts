import { Core } from "@gml-modules/core";

const {
    AST: { isCommentNode }
} = Core;

export function transform(ast: any, opts: any = {}) {
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
    Core.walkObjectGraph(ast, {
        enterObject(value) {
            if (!value || typeof value !== "object") {
                return;
            }

            if (cfg.stripComments) {
                const comments = (value as any).comments;
                if (Array.isArray(comments)) {
                    // Keep any non-comment entries (defensive) but strip known
                    // comment node shapes.
                    const filtered = comments.filter((c) => !isCommentNode(c));
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

export const stripCommentsTransform = transform;

export default { transform };
