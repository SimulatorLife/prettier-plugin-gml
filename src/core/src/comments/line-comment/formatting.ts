import {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    normalizeLineCommentOptions
} from "./options.js";
import { applyJsDocReplacements } from "../doc-comment/service/type-normalization.js";
import { getCommentValue } from "../comment-utils.js";
import { isObjectLike } from "../../utils/object.js";
import { toTrimmedString } from "../../utils/string.js";
import { isRegExpLike } from "../../utils/capability-probes.js";

// BANNER DECORATION PATTERN DESIGN:
//
// The character class below defines which sequences count as "banner decorations"
// in line comments. Banner comments are visual separators like:
//   //============
//   //------------
//   //**********
//
// CRITICAL: The '=' character is intentionally OMITTED from this character class.
//
// WHY: Including '=' would cause the banner-normalization logic to treat the
// equality operator '==' inside commented-out code as a decorative sequence.
// For example, the comment "// if (room == rm_island)" would have its '=='
// incorrectly collapsed or removed during formatting, breaking the commented code.
//
// WHAT WOULD BREAK: Adding '=' here would corrupt any commented-out conditionals,
// comparisons, or assignments that use '==' or '===', making them unreadable or
// syntactically incorrect when un-commented.
//
// The current set ([-_~*#<>|:.]) safely covers common decoration characters
// without risking damage to commented-out code.
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

// Pattern to detect doc-like comments (e.g., "// / text") which use a forward
// slash after the comment prefix to indicate documentation-style content.
// These should not be treated as banner decorations even if they contain
// characters like "**" that would normally be considered decoration.
const DOC_LIKE_COMMENT_PATTERN = /^\/\/\s+\/(?![\/])/;

function getLineCommentRawText(comment, options: any = {}) {
    if (options.originalText && comment.start && comment.end) {
        if (process.env.GML_PRINTER_DEBUG) {
            // console.log(`[DEBUG] getLineCommentRawText using originalText for comment: ${comment.value}`);
        }
        return options.originalText.slice(
            comment.start.index,
            comment.end.index + 1
        );
    }

    if (!isObjectLike(comment)) {
        return "";
    }

    if (comment.leadingText) {
        return comment.leadingText;
    }

    if (comment.raw) {
        return comment.raw;
    }

    const fallbackValue = comment.value == null ? "" : String(comment.value);

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
    if (normalized.length === 0) {
        return null;
    }

    if (!/[A-Za-z0-9]/.test(normalized)) {
        return null;
    }

    return normalized;
}

/**
 * Checks if a comment contains boilerplate text that should be suppressed.
 */
function containsBoilerplate(
    trimmedValue: string,
    boilerplateFragments: string[]
): boolean {
    for (const lineFragment of boilerplateFragments) {
        if (trimmedValue.includes(lineFragment)) {
            return true;
        }
    }
    return false;
}

/**
 * Classifies key properties of a comment for formatting decisions.
 */
function analyzeCommentContext(comment, trimmedOriginal: string) {
    const startsWithTripleSlash = trimmedOriginal.startsWith("///");
    const isPlainTripleSlash =
        startsWithTripleSlash && !trimmedOriginal.includes("@");

    const leadingSlashMatch = trimmedOriginal.match(/^\/+/);
    const leadingSlashCount = leadingSlashMatch
        ? leadingSlashMatch[0].length
        : 0;

    const hasPrecedingLineBreak =
        isObjectLike(comment) &&
        typeof comment.leadingWS === "string" &&
        /\r|\n/.test(comment.leadingWS);

    const hasInlineLeadingChar =
        isObjectLike(comment) &&
        typeof comment.leadingChar === "string" &&
        comment.leadingChar.length > 0 &&
        !/\r|\n/.test(comment.leadingChar);

    const isInlineComment =
        isObjectLike(comment) &&
        comment.isTopComment !== true &&
        (typeof comment.inlinePadding === "number" ||
            comment.trailing === true ||
            comment.placement === "endOfLine" ||
            (!hasPrecedingLineBreak && hasInlineLeadingChar));

    return {
        startsWithTripleSlash,
        isPlainTripleSlash,
        leadingSlashCount,
        isInlineComment
    };
}

/**
 * Attempts to format a comment as a banner or decorative comment.
 * Returns the formatted string if successful, null otherwise.
 */
function tryFormatBannerComment(
    comment,
    trimmedOriginal: string,
    trimmedValue: string,
    slashesMatch: RegExpMatchArray | null,
    hasDecorations: boolean
): string | null {

    if (!slashesMatch) {
        return null;
    }

    if (
        slashesMatch[1].length < LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES &&
        !hasDecorations
    ) {
        return null;
    }

    // For comments with 4+ leading slashes we usually treat them as
    // decorative banners. However, some inputs use many slashes to
    // indicate nested doc-like tags (for example: "//// @func ...").
    // In those cases prefer promoting to a doc comment rather than
    // stripping to a regular comment line.
    const afterStripping = trimmedValue.replace(/^\/+\s*/, "").trimStart();
    if (afterStripping.startsWith("@")) {
        const formatted = applyJsDocReplacements(`/// ${afterStripping}`);
        return applyInlinePadding(comment, formatted);
    }

    // Treat as a banner/decorative comment.
    const bannerContent = normalizeBannerCommentText(trimmedValue);
    if (bannerContent) {
        return applyInlinePadding(comment, `// ${bannerContent}`);
    }

    // If the comment consists entirely of slashes (e.g. "////////////////"),
    // treat it as a decorative separator and suppress it.
    const contentAfterStripping = trimmedValue.replace(/^\/+\s*/, "");

    if (!/[A-Za-z0-9]/.test(contentAfterStripping)) {
        if (isObjectLike(comment)) {
            comment.leadingWS = "";
            comment.trailingWS = "";
        }
        const followingNode = (comment as any)?.followingNode;
        if (
            isObjectLike(followingNode) &&
            followingNode?._featherSuppressLeadingEmptyLine !== false
        ) {
            followingNode._featherSuppressLeadingEmptyLine = true;
        }
        return "";
    }

    // If normalization fails but there is content, return the comment with normalized slashes
    // (e.g. "//// comment" -> "// comment").
    return applyInlinePadding(comment, `// ${contentAfterStripping}`);
}

/**
 * Attempts to promote a comment to doc comment format (///) if it contains @ tags.
 * Returns the formatted string if successful, null otherwise.
 */
function tryPromoteToDocComment(
    comment,
    trimmedOriginal: string,
    trimmedValue: string,
    slashesMatch: RegExpMatchArray | null,
    isPlainTripleSlash: boolean
): string | null {
    // Handle the "/ @tag" pattern where a single forward slash appears before
    // a JSDoc tag (e.g., "// / @param x"). This pattern is treated as a
    // documentation-style comment that should be normalized to the standard
    // "/// @param x" form. Detecting and rewriting this pattern ensures that
    // doc-like comments are consistently formatted, even when the original
    // source uses non-standard spacing or slash counts.
    if (
        slashesMatch &&
        !isPlainTripleSlash &&
        trimmedValue.startsWith("/") &&
        !trimmedValue.startsWith("//")
    ) {
        const remainder = trimmedValue.slice(1);
        if (remainder.trim().startsWith("@")) {
            const shouldInsertSpace =
                remainder.length > 0 && /\w/.test(remainder.charAt(1) || "");
            const formatted = applyJsDocReplacements(
                `///${shouldInsertSpace ? " " : ""}${remainder}`
            );
            return applyInlinePadding(comment, formatted);
        }
    }

    // Check if comment starts with @ tag but needs to be promoted to doc comment format
    // For example: "/ @description" or "// @description" should become "/// @description"
    if (
        !trimmedOriginal.startsWith("///") &&
        trimmedOriginal.startsWith("/") &&
        trimmedOriginal.includes("@")
    ) {
        const afterSlashes = trimmedOriginal.replace(/^\/+\s*/, "");
        if (afterSlashes.startsWith("@")) {
            const shouldInsertSpace =
                afterSlashes.length > 0 &&
                /\w/.test(afterSlashes.charAt(1) || "");
            const formatted = applyJsDocReplacements(
                `///${shouldInsertSpace ? " " : ""}${afterSlashes}`
            );
            return applyInlinePadding(comment, formatted);
        }
    }

    return null;
}

/**
 * Handles doc-like comment patterns (e.g., "// / text" should become "/// text").
 */
function tryFormatDocLikeComment(
    comment,
    trimmedOriginal: string
): string | null {
    const docLikeMatch = trimmedOriginal.match(/^\/\/\s+\/(?![\/])/);
    if (!docLikeMatch) {
        return null;
    }

    const remainder = trimmedOriginal.slice(docLikeMatch[0].length).trimStart();

    // If the original comment value itself looks like a nested commented-out
    // line (for example the AST produces a value like " // // something"),
    // prefer preserving the nested comment visual ("//     // something")
    // rather than promoting it to a doc comment ("/// something").
    if (
        remainder.startsWith("//") ||
        (isObjectLike(comment) &&
            typeof comment.value === "string" &&
            /^\s*\/\//.test(comment.value))
    ) {
        const inner = remainder.startsWith("//")
            ? remainder
            : comment.value.trimStart();
        const padded = `//     ${inner}`;
        return applyInlinePadding(comment, padded);
    }

    // Only promote if it looks like a doc tag (starts with @)
    if (remainder.startsWith("@")) {
        const formatted = `///${remainder.length > 0 ? ` ${remainder}` : ""}`;
        return applyInlinePadding(comment, formatted);
    }
    return null;
}

/**
 * Handles existing doc comments (/// @tag).
 */
function tryFormatExistingDocComment(
    comment,
    trimmedOriginal: string,
    trimmedValue: string,
    startsWithTripleSlash: boolean
): string | null {
    if (!startsWithTripleSlash || !trimmedOriginal.includes("@")) {
        return null;
    }

    const content = trimmedValue.replace(/^\/+\s*/, "");
    const formatted = applyJsDocReplacements(`/// ${content}`) as string;

    if (content.toLowerCase().startsWith("@description")) {
        // intentionally left blank to avoid leaking debug info
    }

    if (formatted.trim() === "/// @description") {
        return "";
    }

    return applyInlinePadding(comment, formatted);
}

/**
 * Handles doc tag line prefix patterns (e.g., "//() @tag").
 */
function tryFormatDocTagPrefix(
    comment,
    trimmedOriginal: string,
    trimmedValue: string
): string | null {
    const docTagSource = DOC_TAG_LINE_PREFIX_PATTERN.test(trimmedValue)
        ? trimmedValue
        : DOC_TAG_LINE_PREFIX_PATTERN.test(trimmedOriginal)
          ? trimmedOriginal
          : null;

    if (!docTagSource) {
        return null;
    }

    let formattedCommentLine = `///${docTagSource.replace(DOC_TAG_LINE_PREFIX_PATTERN, " @")}`;
    formattedCommentLine = applyJsDocReplacements(
        formattedCommentLine
    ) as string;

    if (formattedCommentLine.trim() === "/// @description") {
        return "";
    }

    return applyInlinePadding(comment, formattedCommentLine);
}

/**
 * Handles commented-out code detection and formatting.
 */
function tryFormatCommentedOutCode(
    comment,
    trimmedOriginal: string,
    trimmedValue: string,
    rawValue: string,
    codeDetectionPatterns: RegExp[]
): string | null {
    const leadingWhitespaceMatch = rawValue.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch
        ? leadingWhitespaceMatch[0]
        : "";
    const valueWithoutTrailingWhitespace = rawValue.replace(/\s+$/, "");
    const coreValue = valueWithoutTrailingWhitespace.slice(
        leadingWhitespace.length
    );

    if (
        coreValue.length === 0 ||
        (!trimmedValue.startsWith("//") &&
            !looksLikeCommentedOutCode(coreValue, codeDetectionPatterns))
    ) {
        return null;
    }

    return applyInlinePadding(
        comment,
        `//${leadingWhitespace}${coreValue}`,
        true
    );
}

/**
 * Handles multi-sentence comments that need to be split across lines.
 */
function tryFormatMultiSentenceComment(
    comment,
    trimmedOriginal: string,
    trimmedValue: string,
    isInlineComment: boolean
): string | null {
    const sentences = isInlineComment
        ? [trimmedValue]
        : splitCommentIntoSentences(trimmedValue);

    if (sentences.length <= 1) {
        return null;
    }

    const continuationIndent = extractContinuationIndentation(comment);
    const formattedSentences = sentences.map((sentence, index) => {
        const line = applyInlinePadding(comment, `// ${sentence}`);
        return index === 0 ? line : continuationIndent + line;
    });
    return formattedSentences.join("\n");
}

/**
 * Formats plain triple-slash comments that aren't doc comments.
 */
function tryFormatPlainTripleSlash(
    comment,
    trimmedOriginal: string,
    isPlainTripleSlash: boolean,
    isInlineComment: boolean,
    leadingSlashCount: number
): string | null {
    if (!isPlainTripleSlash) {
        return null;
    }

    if (isInlineComment) {
        const remainder = trimmedOriginal.slice(3).trimStart();
        const formatted = remainder.length > 0 ? `// ${remainder}` : "//";
        return applyInlinePadding(comment, formatted);
    }

    const remainder = trimmedOriginal.slice(3).trimStart();

    if (comment?.isBottomComment === true && /^\d/.test(remainder)) {
        const formatted = remainder.length > 0 ? `// ${remainder}` : "//";
        return applyInlinePadding(comment, formatted);
    }

    if (!isInlineComment && /^\d+\s*[).:-]/.test(remainder)) {
        const formatted = `// ${remainder}`;
        return applyInlinePadding(comment, formatted);
    }

    if (
        leadingSlashCount >= LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES &&
        !isInlineComment
    ) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    return null;
}

/**
 * Formats a line comment according to the project's style conventions.
 * Uses a series of specialized helper functions to handle different comment patterns,
 * making the control flow easier to follow through early returns and guard clauses.
 */
function formatLineComment(
    comment,
    lineCommentOptions: any = DEFAULT_LINE_COMMENT_OPTIONS
) {
    const normalizedOptions = normalizeLineCommentOptions(lineCommentOptions);
    const { boilerplateFragments, codeDetectionPatterns } = normalizedOptions;
    const original = getLineCommentRawText(comment, lineCommentOptions);
    const trimmedOriginal = original.trim();
    const rawValue = getCommentValue(comment);
    const trimmedValue = getCommentValue(comment, { trim: true });

    // Guard: empty comments
    if (trimmedValue.length === 0) {
        return null;
    }

    // Guard: suppress boilerplate
    if (containsBoilerplate(trimmedValue, boilerplateFragments)) {
        return null;
    }

    const context = analyzeCommentContext(comment, trimmedOriginal);
    const {
        startsWithTripleSlash,
        isPlainTripleSlash,
        leadingSlashCount,
        isInlineComment
    } = context;

    const slashesMatch = original.match(/^\s*(\/{2,})(.*)$/);
    const contentWithoutSlashes = trimmedValue.replace(/^\/+\s*/, "");

    // Check if this is a doc-like comment before treating it as a banner
    const isDocLikeComment = DOC_LIKE_COMMENT_PATTERN.test(trimmedOriginal);

    const hasDecorations =
        !isDocLikeComment &&
        (LEADING_BANNER_DECORATION_PATTERN.test(contentWithoutSlashes) ||
            TRAILING_BANNER_DECORATION_PATTERN.test(contentWithoutSlashes) ||
            (contentWithoutSlashes.match(INNER_BANNER_DECORATION_PATTERN) || [])
                .length > 0);

    if (
        contentWithoutSlashes.length === 0 &&
        trimmedValue.length > 0 &&
        leadingSlashCount < LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES
    ) {
        return applyInlinePadding(comment, "//");
    }

    // Try banner comment formatting
    const bannerResult = tryFormatBannerComment(
        comment,
        trimmedOriginal,
        trimmedValue,
        slashesMatch,
        hasDecorations
    );
    if (bannerResult !== null) {
        return bannerResult;
    }

    if (trimmedValue.includes(".__FromBuffer")) {
        console.log("DEBUG: formatLineComment .__FromBuffer");
        console.log("DEBUG: bannerResult", bannerResult);
        console.log(
            "DEBUG: tryFormatCommentedOutCode result",
            tryFormatCommentedOutCode(
                comment,
                trimmedOriginal,
                trimmedValue,
                rawValue,
                codeDetectionPatterns
            )
        );
    }

    // Try promoting to doc comment
    const docPromotionResult = tryPromoteToDocComment(
        comment,
        trimmedOriginal,
        trimmedValue,
        slashesMatch,
        isPlainTripleSlash
    );
    if (docPromotionResult !== null) {
        return docPromotionResult;
    }

    // Try formatting plain triple-slash comments
    const tripleSlashResult = tryFormatPlainTripleSlash(
        comment,
        trimmedOriginal,
        isPlainTripleSlash,
        isInlineComment,
        leadingSlashCount
    );
    if (tripleSlashResult !== null) {
        return tripleSlashResult;
    }

    // Try formatting doc-like comments
    const docLikeResult = tryFormatDocLikeComment(comment, trimmedOriginal);
    if (docLikeResult !== null) {
        return docLikeResult;
    }

    // Try formatting existing doc comments
    const existingDocResult = tryFormatExistingDocComment(
        comment,
        trimmedOriginal,
        trimmedValue,
        startsWithTripleSlash
    );
    if (existingDocResult !== null) {
        return existingDocResult;
    }

    // Try formatting doc tag prefix patterns
    const docTagPrefixResult = tryFormatDocTagPrefix(
        comment,
        trimmedOriginal,
        trimmedValue
    );
    if (docTagPrefixResult !== null) {
        return docTagPrefixResult;
    }

    // Try formatting commented-out code
    const commentedCodeResult = tryFormatCommentedOutCode(
        comment,
        trimmedOriginal,
        trimmedValue,
        rawValue,
        codeDetectionPatterns
    );
    if (commentedCodeResult !== null) {
        return commentedCodeResult;
    }

    // Try formatting multi-sentence comments
    const multiSentenceResult = tryFormatMultiSentenceComment(
        comment,
        trimmedOriginal,
        trimmedValue,
        isInlineComment
    );
    if (multiSentenceResult !== null) {
        return multiSentenceResult;
    }

    // Default: format as a regular comment
    return applyInlinePadding(
        comment,
        `//${trimmedValue.startsWith("/") ? "" : " "}${trimmedValue}`
    );
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
    if (!isObjectLike(comment)) {
        return 0;
    }

    const { inlinePadding } = comment;
    if (typeof inlinePadding === "number" && inlinePadding > 0) {
        return inlinePadding;
    }

    return 0;

}

function extractContinuationIndentation(comment) {
    if (!isObjectLike(comment)) {
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
    const trimmed = toTrimmedString(text);
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
        if (!isRegExpLike(pattern)) {
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
    if (!text) {
        return [text];
    }

    // Check for explicit comment separators " // " to split merged comments
    // e.g. "// Comment 1 // Comment 2" -> ["Comment 1", "Comment 2"]
    // We use a regex that requires whitespace around the slashes to avoid splitting URLs
    const commentSeparatorMatch = text.match(/\s\/\/\s/);
    if (commentSeparatorMatch) {
        const parts = text.split(/\s\/\/\s/);
        return parts.flatMap((part) => splitCommentIntoSentences(part));
    }

    if (!text.includes(". ")) {
        return [text];
    }

    const sentences = [];
    let currentIndex = 0;
    let nextIndex;

    while ((nextIndex = text.indexOf(". ", currentIndex)) !== -1) {
        // Extract sentence including the period (but not the space)
        sentences.push(text.slice(currentIndex, nextIndex + 1).trim());
        // Move past the ". " separator to start the next sentence. Adding 2
        // to the index skips both the period and the space, positioning the
        // cursor at the first character of the following sentence. This ensures
        // the sentence-splitting logic does not include trailing punctuation
        // or leading spaces in the extracted sentence text.
        currentIndex = nextIndex + 2;
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
