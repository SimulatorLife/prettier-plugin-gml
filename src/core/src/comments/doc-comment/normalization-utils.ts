import { isObjectLike, type MutableDocCommentLines, shouldSkipTraversal } from "./utils.js";

/**
 * Metadata payload attached to AST nodes by the doc-comment normalisation pass
 * and consumed by the formatter to emit pre-computed doc lines.
 */
export type DocCommentNormalizationPayload = {
    docCommentDocs: MutableDocCommentLines;
    needsLeadingBlankLine: boolean;
    _preserveDescriptionBreaks?: boolean;
    _suppressLeadingBlank?: boolean;
};

const DOC_COMMENT_NORMALIZATION_KEY = Symbol("gmlDocCommentNormalization");

/**
 * Reads the doc-comment normalisation payload that was previously attached to
 * {@link node} via {@link setDocCommentNormalization}. Returns `null` when no
 * payload is present or the node cannot be traversed.
 */
export function getDocCommentNormalization(node: unknown): DocCommentNormalizationPayload | null {
    if (shouldSkipTraversal(node)) {
        return null;
    }

    const maybePayload = Reflect.get(node as object, DOC_COMMENT_NORMALIZATION_KEY);

    if (!isObjectLike(maybePayload)) {
        return null;
    }

    const { docCommentDocs, needsLeadingBlankLine, _preserveDescriptionBreaks, _suppressLeadingBlank } =
        maybePayload as {
            docCommentDocs?: MutableDocCommentLines;
            needsLeadingBlankLine?: boolean;
            _preserveDescriptionBreaks?: boolean;
            _suppressLeadingBlank?: boolean;
        };

    if (!Array.isArray(docCommentDocs)) {
        return null;
    }

    return {
        docCommentDocs,
        needsLeadingBlankLine: Boolean(needsLeadingBlankLine),
        _preserveDescriptionBreaks,
        _suppressLeadingBlank
    };
}

/**
 * Attaches (or removes) a doc-comment normalisation payload on {@link node}.
 * Pass `null` to clear any previously stored payload.
 */
export function setDocCommentNormalization(node: unknown, payload: DocCommentNormalizationPayload | null) {
    if (shouldSkipTraversal(node)) {
        return;
    }

    if (payload === null) {
        Reflect.deleteProperty(node as object, DOC_COMMENT_NORMALIZATION_KEY);
        return;
    }

    Reflect.set(node as object, DOC_COMMENT_NORMALIZATION_KEY, payload);
}
