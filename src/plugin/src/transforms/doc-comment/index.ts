import { Core } from "@gml-modules/core";

export type { DocCommentNormalizationPayload } from "@gml-modules/core";

export const DescriptionUtils = {
    classifyDescriptionContinuationLine: Core.classifyDescriptionContinuationLine,
    resolveDescriptionIndentation: Core.resolveDescriptionIndentation,
    collectDescriptionContinuations: Core.collectDescriptionContinuations,
    applyDescriptionContinuations: Core.applyDescriptionContinuations,
    ensureDescriptionContinuations: Core.ensureDescriptionContinuations
} as const;

export const NormalizationUtils = {
    getDocCommentNormalization: Core.getDocCommentNormalization
} as const;
