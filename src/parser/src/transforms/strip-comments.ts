import { Core } from "@gml-modules/core";
import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./index.js";

type StripCommentsTransformOptions = {
    stripComments: boolean;
    stripJsDoc: boolean;
    dropCommentedOutCode: boolean;
};

class StripCommentsTransform extends FunctionalParserTransform<
    StripCommentsTransformOptions
> {
    constructor() {
        super("strip-comments", {
            stripComments: true,
            stripJsDoc: true,
            dropCommentedOutCode: false
        });
    }

    protected execute(
        ast: any,
        options: StripCommentsTransformOptions
    ): MutableGameMakerAstNode | any {
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
}

const stripCommentsTransformInstance = new StripCommentsTransform();

export function transform(
    ast: any,
    opts: StripCommentsTransformOptions = stripCommentsTransformInstance.defaultOptions
) {
    return stripCommentsTransformInstance.transform(ast, opts);
}

export const stripCommentsTransform = transform;

export default { transform };
