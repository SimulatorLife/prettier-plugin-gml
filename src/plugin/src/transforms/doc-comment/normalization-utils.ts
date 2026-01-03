import type { MutableDocCommentLines } from "@gml-modules/core";

export type DocCommentNormalizationPayload = {
    docCommentDocs: MutableDocCommentLines;
    needsLeadingBlankLine: boolean;
    _preserveDescriptionBreaks?: boolean;
    _suppressLeadingBlank?: boolean;
};

const DOC_COMMENT_NORMALIZATION_KEY = Symbol("gmlDocCommentNormalization");

export function getDocCommentNormalization(node: unknown): DocCommentNormalizationPayload | null {
    if (!node || typeof node !== "object") {
        return null;
    }

    const maybePayload = Reflect.get(node, DOC_COMMENT_NORMALIZATION_KEY);

    if (!maybePayload || typeof maybePayload !== "object") {
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

export function setDocCommentNormalization(node: unknown, payload: DocCommentNormalizationPayload | null) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (payload === null) {
        Reflect.deleteProperty(node, DOC_COMMENT_NORMALIZATION_KEY);
        return;
    }

    Reflect.set(node, DOC_COMMENT_NORMALIZATION_KEY, payload);
}
