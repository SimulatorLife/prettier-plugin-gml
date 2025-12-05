import { Core } from "@gml-modules/core";
import { concat, hardline, join } from "./doc-builders.js";
import { resolveDocCommentPrinterOptions } from "./doc-comment-options.js";

const STRING_TYPE = "string";

export function buildSyntheticDocComment(
    functionNode,
    existingDocLines,
    options,
    overrides: any = {}
) {
    const docCommentOptions = resolveDocCommentPrinterOptions(options);

    const hasExistingDocLines = existingDocLines.length > 0;

    const syntheticLines = hasExistingDocLines
        ? Core.mergeSyntheticDocComments(
              functionNode,
              existingDocLines,
              docCommentOptions,
              overrides
          )
        : Core.reorderDescriptionLinesAfterFunction(
              Core.computeSyntheticFunctionDocLines(
                  functionNode,
                  [],
                  options,
                  overrides
              )
          );

    const leadingCommentLines = Array.isArray(overrides?.leadingCommentLines)
        ? overrides.leadingCommentLines
              .map((line) => (typeof line === STRING_TYPE ? line : null))
              .filter((line) => Core.isNonEmptyTrimmedString(line))
        : [];

    if (syntheticLines.length === 0 && leadingCommentLines.length === 0) {
        return null;
    }

    const potentiallyPromotableLines =
        leadingCommentLines.length > 0 && syntheticLines.length > 0
            ? Core.promoteLeadingDocCommentTextToDescription([
                  ...leadingCommentLines,
                  syntheticLines[0]
              ]).slice(0, leadingCommentLines.length)
            : leadingCommentLines;

    const docLines =
        leadingCommentLines.length === 0
            ? syntheticLines
            : [
                  ...potentiallyPromotableLines,
                  ...(syntheticLines.length > 0 ? ["", ...syntheticLines] : [])
              ];

    const normalizedDocLines = Core.toMutableArray(docLines) as string[];

    return {
        doc: concat([hardline, join(hardline, normalizedDocLines)]),
        hasExistingDocLines
    };
}
