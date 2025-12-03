// TODO: We should move actual formatting logic into @gml-modules/plugin. Parser should just handle AST manipulation.

import { Core } from "@gml-modules/core";
import {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    normalizeLineCommentOptions
} from "./line-comment-options.js";
// Use the public Core namespace directly; do not destructure across packages

// Note: '=' is intentionally omitted from the decoration class to avoid
// treating the equality operator '==' inside commented-out code as a
// decorative banner sequence. Keeping '=' here caused valid code like
// "if (room == rm_island)" to have its '==' collapsed during banner
// normalization.
const BANNER_DECORATION_CLASS = "[-_~*#<>|:.]";
const LEADING_BANNER_DECORATION_PATTERN = new RegExp(
    String.raw`^(?:${BANNER_DECORATION_CLASS}{2,}\s*)+`
);
const TRAILING_BANNER_DECORATION_PATTERN = new RegExp(
    String.raw`(?:\s*${BANNER_DECORATION_CLASS}{2,})+$`
);
const INNER_BANNER_DECORATION_PATTERN = new RegExp(
    `${BANNER_DECORATION_CLASS}{2,}`,
    "g"
);

const DOC_TAG_LINE_PREFIX_PATTERN = /^\/+\(\s*\)@/;

function getLineCommentRawText(comment, options: any = {}) {
    if (options.originalText && comment.start && comment.end) {
        return options.originalText.slice(
            comment.start.index,
            comment.end.index + 1
        );
    }

    if (!Core.isObjectLike(comment)) {
        return "";
    }

    if (comment.leadingText) {
        return comment.leadingText;
    }

    if (comment.raw) {
        return comment.raw;
    }

    const fallbackValue =
        comment.value === undefined || comment.value === null
            ? ""
            : String(comment.value);

    return `//${fallbackValue}`;
}

type BannerNormalizationOptions = {
    assumeDecorated?: boolean;
};

function normalizeBannerCommentText(
    candidate,
    options: BannerNormalizationOptions = {}
) {
    if (typeof candidate !== "string") {
        return null;
    }

    const raw = candidate;
    let text = raw.trim();
    if (text.length === 0) {
        return null;
    }

    const { assumeDecorated = false } = options;
    const sawDecoration =
        assumeDecorated ||
        INNER_BANNER_DECORATION_PATTERN.test(raw) ||
        /\/{2,}\s*$/.test(raw) ||
        /\/{4,}/.test(raw);

    if (!sawDecoration) {
        return null;
    }

    text = text.replace(/\/{2,}\s*$/, "").trim();
    if (text.length === 0) {
        return null;
    }

    text = text.replace(/^\/{4,}\s*/, "");
    text = text.replace(LEADING_BANNER_DECORATION_PATTERN, "");
    text = text.replace(TRAILING_BANNER_DECORATION_PATTERN, "");

    const innerMatches = text.match(INNER_BANNER_DECORATION_PATTERN) || [];
    for (const match of innerMatches) {
        const firstChar = match[0];
        if (match.split("").every((char) => char === firstChar)) {
            text = text.replaceAll(match, " ");
        }
    }

    text = text.replaceAll(/\s+/g, " ");

    const normalized = text.trim();
    return normalized.length > 0 ? normalized : null;
}

function formatLineComment(
    comment,
    lineCommentOptions = DEFAULT_LINE_COMMENT_OPTIONS
) {
    const normalizedOptions = normalizeLineCommentOptions(lineCommentOptions);
    const { boilerplateFragments, codeDetectionPatterns } = normalizedOptions;
    const original = getLineCommentRawText(comment, lineCommentOptions);
    const trimmedOriginal = original.trim();
    const rawValue = Core.getCommentValue(comment);
    const trimmedValue = Core.getCommentValue(comment, { trim: true });
    const startsWithTripleSlash = trimmedOriginal.startsWith("///");
    const isPlainTripleSlash =
        startsWithTripleSlash && !trimmedOriginal.includes("@");

    const leadingSlashMatch = trimmedOriginal.match(/^\/+/);
    const leadingSlashCount = leadingSlashMatch
        ? leadingSlashMatch[0].length
        : 0;

    for (const lineFragment of boilerplateFragments) {
        if (trimmedValue.includes(lineFragment)) {
            console.log(
                `DEBUG: Suppressing comment "${trimmedValue}" because it matches fragment "${lineFragment}"`
            );
            return "";
        }
    }

    const hasPrecedingLineBreak =
        Core.isObjectLike(comment) &&
        typeof comment.leadingWS === "string" &&
        /\r|\n/.test(comment.leadingWS);

    const hasInlineLeadingChar =
        Core.isObjectLike(comment) &&
        typeof comment.leadingChar === "string" &&
        comment.leadingChar.length > 0 &&
        !/\r|\n/.test(comment.leadingChar);

    const isInlineComment =
        Core.isObjectLike(comment) &&
        comment.isTopComment !== true &&
        (typeof comment.inlinePadding === "number" ||
            comment.trailing === true ||
            comment.placement === "endOfLine" ||
            (!hasPrecedingLineBreak && hasInlineLeadingChar));

    const slashesMatch = original.match(/^\s*(\/{2,})(.*)$/);
    if (
        slashesMatch &&
        slashesMatch[1].length >= LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES
    ) {
        console.log(`DEBUG: Banner detected: ${trimmedValue}`);
        // For comments with 4+ leading slashes we usually treat them as
        // decorative banners. However, some inputs use many slashes to
        // indicate nested doc-like tags (for example: "//// @func ...").
        // In those cases prefer promoting to a doc comment rather than
        // stripping to a regular comment line.
        const afterStripping = trimmedValue.replace(/^\/+\s*/, "").trimStart();
        if (afterStripping.startsWith("@")) {
            // Promote to /// @... style and apply replacements (e.g. @func -> @function)
            const formatted = Core.applyJsDocReplacements(
                `/// ${afterStripping}`
            );
            return applyInlinePadding(comment, formatted);
        }

        // Check if it has decorations other than slashes. If not, preserve the original style.
        // This ensures that comments like "//// Text" are preserved, while "//// ---- Text ----" are normalized.
        const contentWithoutSlashes = trimmedValue.replace(/^\/+\s*/, "");
        const hasDecorations =
            LEADING_BANNER_DECORATION_PATTERN.test(contentWithoutSlashes) ||
            TRAILING_BANNER_DECORATION_PATTERN.test(contentWithoutSlashes) ||
            (contentWithoutSlashes.match(INNER_BANNER_DECORATION_PATTERN) || [])
                .length > 0;

        if (!hasDecorations && // If it's exactly 4 slashes, preserve it (legacy/style choice).
            // If it's more than 4, normalize it (excessive slashes).
            slashesMatch[1].length === 4) {
                return applyInlinePadding(comment, trimmedOriginal);
            }

        // Otherwise treat as a banner/decorative comment as before.
        const bannerContent = normalizeBannerCommentText(trimmedValue);
        console.log(`DEBUG: Banner content: "${bannerContent}"`);
        if (bannerContent) {
            return applyInlinePadding(comment, `// ${bannerContent}`);
        }

        // If the comment consists entirely of slashes (e.g. "////////////////"),
        // treat it as a decorative separator and suppress it.
        const contentAfterStripping = trimmedValue.replace(/^\/+\s*/, "");
        if (contentAfterStripping.length === 0) {
            return "";
        }

        // If normalization fails but there is content, return the original comment
        // to preserve the user's slash style (e.g. "//// comment").
        return applyInlinePadding(comment, trimmedOriginal);
    }

    // Check if this is a banner-style comment with decorations (even with 2-3 leading slashes)
    // But avoid affecting doc comments that start with /// patterns or doc-like patterns
    if (slashesMatch && !isPlainTripleSlash) {
        // Check for doc-like patterns that should remain as doc comments, not banner comments
        // Only process if it starts with exactly one slash (like "/ @tag"), not multiple slashes
        if (trimmedValue.startsWith("/") && !trimmedValue.startsWith("//")) {
            const remainder = trimmedValue.slice(1); // Remove just the first slash
            if (remainder.trim().startsWith("@")) {
                const shouldInsertSpace =
                    remainder.length > 0 &&
                    /\w/.test(remainder.charAt(1) || "");
                const formatted = Core.applyJsDocReplacements(
                    `///${shouldInsertSpace ? " " : ""}${remainder}`
                );
                return applyInlinePadding(comment, formatted);
            }
        } else if (normalizeBannerCommentText(trimmedValue)) {
            // Only apply banner normalization if it doesn't look like a doc comment
            const bannerContent = normalizeBannerCommentText(trimmedValue);
            if (bannerContent) {
                return applyInlinePadding(comment, `// ${bannerContent}`);
            }
        }
    }

    if (isInlineComment && isPlainTripleSlash) {
        const remainder = trimmedOriginal.slice(3).trimStart();
        const formatted = remainder.length > 0 ? `// ${remainder}` : "//";
        return applyInlinePadding(comment, formatted);
    }

    if (isPlainTripleSlash) {
        const remainder = trimmedOriginal.slice(3).trimStart();

        if (comment?.isBottomComment === true && /^\d/.test(remainder)) {
            const formatted = remainder.length > 0 ? `// ${remainder}` : "//";
            return applyInlinePadding(comment, formatted);
        }

        if (!isInlineComment && /^\d+\s*[).:-]/.test(remainder)) {
            const formatted = `// ${remainder}`;
            return applyInlinePadding(comment, formatted);
        }
    }

    if (
        isPlainTripleSlash &&
        leadingSlashCount >= LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES &&
        !isInlineComment
    ) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    const docContinuationMatch = trimmedValue.match(/^\/\s*(\S.*)$/);
    if (docContinuationMatch && isPlainTripleSlash && !isInlineComment) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    // Check if comment starts with @ tag but needs to be promoted to doc comment format
    // For example: "/ @description" or "// @description" should become "/// @description"
    if (
        !trimmedOriginal.startsWith("///") &&
        trimmedOriginal.startsWith("/") &&
        trimmedOriginal.includes("@")
    ) {
        // Find where the leading slashes end and @ tag begins
        const afterSlashes = trimmedOriginal.replace(/^\/+\s*/, "");
        if (afterSlashes.startsWith("@")) {
            const shouldInsertSpace =
                afterSlashes.length > 0 &&
                /\w/.test(afterSlashes.charAt(1) || "");
            const formatted = Core.applyJsDocReplacements(
                `///${shouldInsertSpace ? " " : ""}${afterSlashes}`
            );
            return applyInlinePadding(comment, formatted);
        }
    }

    // Handle doc-like comment prefix normalization: convert "// / text" to "/// text"
    // This handles doc comments that start with "// /" (two slashes, space, slash) but don't have an @ tag yet
    // The pattern ensures it's "//" + whitespace + "/" but NOT "//" + whitespace + "//" (which would be commented-out code)
    const docLikeMatch = trimmedOriginal.match(/^\/\/\s+\/(?![\/])/); // Match "//" followed by whitespace and single "/" (not double "//")
    if (docLikeMatch) {
        const remainder = trimmedOriginal
            .slice(docLikeMatch[0].length)
            .trimStart();
        // If the original comment value itself looks like a nested commented-out
        // line (for example the AST produces a value like " // // something"),
        // prefer preserving the nested comment visual ("//     // something")
        // rather than promoting it to a doc comment ("/// something").
        // If the remainder itself is a nested comment (starts with `//`) or the
        // original comment.value contains a nested `//` then preserve the
        // nested commented-out visual alignment instead of promoting to
        // `/// ...` doc comments.
        if (
            remainder.startsWith("//") ||
            (Core.isObjectLike(comment) &&
                typeof comment.value === "string" &&
                /^\s*\/\//.test(comment.value))
        ) {
            const inner = remainder.startsWith("//")
                ? remainder
                : comment.value.trimStart(); // preserves the inner `// ...`
            const padded = `//     ${inner}`; // match expected golden spacing for nested comments
            return applyInlinePadding(comment, padded);
        }

        const formatted = `///${remainder.length > 0 ? ` ${remainder}` : ""}`;
        return applyInlinePadding(comment, formatted);
    }

    const docTagSource = DOC_TAG_LINE_PREFIX_PATTERN.test(trimmedValue)
        ? trimmedValue
        : DOC_TAG_LINE_PREFIX_PATTERN.test(trimmedOriginal)
          ? trimmedOriginal
          : null;
    if (docTagSource) {
        let formattedCommentLine = `///${docTagSource.replace(DOC_TAG_LINE_PREFIX_PATTERN, " @")}`;
        formattedCommentLine = Core.applyJsDocReplacements(
            formattedCommentLine
        ) as string;
        return applyInlinePadding(comment, formattedCommentLine);
    }

    const sentences = isInlineComment
        ? [trimmedValue]
        : splitCommentIntoSentences(trimmedValue);
    if (sentences.length > 1) {
        const continuationIndent = extractContinuationIndentation(comment);
        const formattedSentences = sentences.map((sentence, index) => {
            const line = applyInlinePadding(comment, `// ${sentence}`);
            return index === 0 ? line : continuationIndent + line;
        });
        return formattedSentences.join("\n");
    }

    const leadingWhitespaceMatch = rawValue.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch
        ? leadingWhitespaceMatch[0]
        : "";
    const valueWithoutTrailingWhitespace = rawValue.replace(/\s+$/, "");
    const coreValue = valueWithoutTrailingWhitespace
        .slice(leadingWhitespace.length)
        .trim();

    if (
        coreValue.length > 0 &&
        (trimmedValue.startsWith("//") ||
            looksLikeCommentedOutCode(coreValue, codeDetectionPatterns))
    ) {
        return applyInlinePadding(
            comment,
            `//${leadingWhitespace}${coreValue}`,
            true
        );
    }

    return applyInlinePadding(comment, `// ${trimmedValue}`);
}

function applyInlinePadding(comment, formattedText, preserveTabs = false) {
    const normalizedText =
        !preserveTabs && formattedText.includes("\t")
            ? formattedText.replaceAll("\t", "    ")
            : formattedText;

    const paddingWidth = resolveInlinePaddingWidth(comment);

    if (paddingWidth <= 0) {
        return normalizedText;
    }

    return " ".repeat(paddingWidth) + normalizedText;
}

function resolveInlinePaddingWidth(comment) {
    if (!Core.isObjectLike(comment)) {
        return 0;
    }

    const { inlinePadding } = comment;
    if (typeof inlinePadding === "number" && inlinePadding > 0) {
        return inlinePadding;
    }

    if (
        comment?.isBottomComment !== true ||
        (comment.trailing !== true && comment.placement !== "endOfLine") ||
        comment.leadingChar !== ";"
    ) {
        return 0;
    }

    const leadingWhitespace =
        typeof comment.leadingWS === "string" ? comment.leadingWS : "";
    if (leadingWhitespace.length >= 2) {
        return 0;
    }

    return comment.placement === "endOfLine" ? 1 : 0;
}

function extractContinuationIndentation(comment) {
    if (!Core.isObjectLike(comment)) {
        return "";
    }

    const leadingWhitespace =
        typeof comment.leadingWS === "string" ? comment.leadingWS : "";

    if (leadingWhitespace.length === 0) {
        return "";
    }

    const segments = leadingWhitespace.split(/\r?\n/);
    const lastSegment = segments.at(-1) ?? "";

    return lastSegment.replaceAll("\t", "    ");
}

function looksLikeCommentedOutCode(text, codeDetectionPatterns) {
    const trimmed = Core.toTrimmedString(text);
    if (trimmed.length === 0) {
        return false;
    }

    // Remove potential comment prefixes before testing patterns
    // For example: "// if (condition)" becomes "if (condition)"
    // This allows the patterns to match the actual code content
    const contentWithoutCommentPrefix = trimmed.replace(/^\/+\s*/, "");

    const patterns = Array.isArray(codeDetectionPatterns)
        ? codeDetectionPatterns
        : DEFAULT_COMMENTED_OUT_CODE_PATTERNS;

    for (const pattern of patterns) {
        if (!Core.isRegExpLike(pattern)) {
            continue;
        }

        if (typeof pattern.lastIndex === "number") {
            pattern.lastIndex = 0;
        }

        if (pattern.test(contentWithoutCommentPrefix)) {
            return true;
        }
    }

    return false;
}

function splitCommentIntoSentences(text) {
    if (!text || !text.includes(". ")) {
        return [text];
    }

    const sentences = [];
    let currentIndex = 0;
    let nextIndex;

    while ((nextIndex = text.indexOf(". ", currentIndex)) !== -1) {
        // Extract sentence including the period (but not the space)
        sentences.push(text.slice(currentIndex, nextIndex + 1).trim());
        // Move past the ". " to start the next sentence
        currentIndex = nextIndex + 2; // Skip ". "
    }

    // Add the remaining part if any
    if (currentIndex < text.length) {
        const remaining = text.slice(Math.max(0, currentIndex)).trim();
        if (remaining.length > 0) {
            sentences.push(remaining);
        }
    }

    return sentences;
}

export {
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText,
    normalizeBannerCommentText
};
