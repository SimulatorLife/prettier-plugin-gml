import { DEFAULT_DOC_COMMENT_MAX_WRAP_WIDTH } from "./doc-comment-wrap-width.js";

export function resolveDocCommentPrinterOptions(options: any) {
    return {
        ...options,
        docCommentMaxWrapWidth:
            options?.docCommentMaxWrapWidth ??
            DEFAULT_DOC_COMMENT_MAX_WRAP_WIDTH
    };
}
