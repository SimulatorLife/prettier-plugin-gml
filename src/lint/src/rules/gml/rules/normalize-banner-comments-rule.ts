import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, reportFullTextRewrite } from "../rule-base-helpers.js";
import { dominantLineEnding } from "../rule-helpers.js";

const DECORATIVE_BANNER_RUN_PATTERN = /[/_*#<>|:~-]{6,}/u;
const LEADING_DECORATIVE_PATTERN = /^[\s/_*#<>|:~-]+/u;
const TRAILING_DECORATIVE_PATTERN = /[\s/_*#<>|:~-]+$/u;

function isDocTagCommentLine(line: string): boolean {
    return /^\s*\/\/\/\s*@/u.test(line);
}

function normalizeBannerCommentLine(line: string): string {
    if (isDocTagCommentLine(line)) {
        return line;
    }

    const lineCommentMatch = /^(\s*)\/\/(.*)$/u.exec(line);
    if (!lineCommentMatch) {
        return line;
    }

    const leadingWhitespace = lineCommentMatch[1] ?? "";
    const content = lineCommentMatch[2] ?? "";
    if (!DECORATIVE_BANNER_RUN_PATTERN.test(content) && !/\/{4,}/u.test(content)) {
        return line;
    }

    const normalizedContent = content
        .replace(LEADING_DECORATIVE_PATTERN, "")
        .replace(TRAILING_DECORATIVE_PATTERN, "")
        .trim();
    if (normalizedContent.length === 0) {
        return "";
    }

    return `${leadingWhitespace}// ${normalizedContent}`;
}

/**
 * Creates the `gml/normalize-banner-comments` rule.
 *
 * Canonicalizes decorative banner comment lines to plain `//` comments and
 * removes slash-only separators so banner content normalization is lint-owned.
 */
export function createNormalizeBannerCommentsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(sourceText);
                    const sourceLines = sourceText.split(/\r?\n/u);
                    const rewrittenLines = sourceLines.map((line) => normalizeBannerCommentLine(line));
                    const rewrittenText = rewrittenLines.join(lineEnding);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}
