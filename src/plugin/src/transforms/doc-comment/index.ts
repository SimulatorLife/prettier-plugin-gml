import {
    applyDescriptionContinuations,
    classifyDescriptionContinuationLine,
    collectDescriptionContinuations,
    ensureDescriptionContinuations,
    type MutableDocCommentLines,
    resolveDescriptionIndentation
} from "@gml-modules/core";

/**
 * Utilities for processing `@description` lines in GML doc comments.
 * These are pure string-manipulation helpers consumed by the printer.
 */
export const DescriptionUtils = Object.freeze({
    classifyDescriptionContinuationLine,
    resolveDescriptionIndentation,
    collectDescriptionContinuations,
    applyDescriptionContinuations,
    ensureDescriptionContinuations
});

/**
 * Shape of pre-computed doc comment normalization data that may be attached
 * to an AST node by a lint normalization pass.
 */
export type DocCommentNormalizationPayload = {
    docCommentDocs: MutableDocCommentLines;
    needsLeadingBlankLine: boolean;
    _preserveDescriptionBreaks?: boolean;
    _suppressLeadingBlank?: boolean;
};

/**
 * Utilities for reading pre-computed doc comment normalization metadata
 * that may have been attached by a lint normalization pass.
 *
 * Returns null when no pre-computed metadata is present, in which case
 * callers should fall through to on-demand computation via DescriptionUtils.
 */
export const NormalizationUtils = Object.freeze({
    getDocCommentNormalization(_node: unknown): DocCommentNormalizationPayload | null {
        return null;
    }
});
