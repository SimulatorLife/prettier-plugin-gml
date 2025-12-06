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
    comment: unknown,
    lineCommentOptions: unknown = DEFAULT_LINE_COMMENT_OPTIONS
) {
    const normalizedOptions = normalizeLineCommentOptions(lineCommentOptions);
    const context = createLineCommentContext(
        comment,
        lineCommentOptions,
        normalizedOptions
    );

    if (context.trimmedValue.length === 0) {
        return null;
    }

    if (
        shouldSuppressBoilerplate(
            context,
            normalizedOptions.boilerplateFragments
        )
    ) {
        return null;
    }

    const handlers = [
        handleHighSlashBanner,
        handleDecoratedBanner,
        handleInlineTripleSlashDoc,
        handlePlainTripleSlashNumeric,
        handlePlainTripleSlashBannerPreservation,
        handleDocContinuation,
        handleSlashDocPromotion,
        handleDocLikePrefix,
        handleDocTagLine,
        handleCommentedOutCode,
        handleMultiSentenceComment
    ];

    for (const handler of handlers) {
        const result = handler(context);
        if (result !== undefined) {
            return result;
        }
    }

    return applyInlinePadding(
        context.comment,
        `// ${context.trimmedValue}`
    );
}

type LineCommentContext = {
    comment: any;
    normalizedOptions: ReturnType<typeof normalizeLineCommentOptions>;
    lineCommentOptions: unknown;
    original: string;
    trimmedOriginal: string;
    rawValue: string;
    trimmedValue: string;
    startsWithTripleSlash: boolean;
    isPlainTripleSlash: boolean;
    hasPrecedingLineBreak: boolean;
    hasInlineLeadingChar: boolean;
    isInlineComment: boolean;
    slashesMatch: RegExpMatchArray | null;
    leadingSlashCount: number;
    docContinuationMatch: RegExpMatchArray | null;
    docLikeMatch: RegExpMatchArray | null;
    docTagSource: string | null;
    leadingWhitespace: string;
    valueWithoutTrailingWhitespace: string;
    coreValue: string;
};

function createLineCommentContext(
    comment: any,
    lineCommentOptions: unknown,
    normalizedOptions: LineCommentContext["normalizedOptions"]
): LineCommentContext {
    const original = getLineCommentRawText(comment, lineCommentOptions);
    const trimmedOriginal = original.trim();
    const rawValue = Core.getCommentValue(comment);
    const trimmedValue = Core.getCommentValue(comment, { trim: true });
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
    const startsWithTripleSlash = trimmedOriginal.startsWith("///");
    const isPlainTripleSlash =
        startsWithTripleSlash && !trimmedOriginal.includes("@");
    const slashesMatch = original.match(/^\s*(\/{2,})(.*)$/);
    const leadingSlashMatch = trimmedOriginal.match(/^\/+/);
    const leadingSlashCount = leadingSlashMatch ? leadingSlashMatch[0].length : 0;
    const docContinuationMatch = trimmedValue.match(/^\/\s*(\S.*)$/);
    const docLikeMatch = trimmedOriginal.match(/^\/\/\s+\/(?![\/])/);
    const docTagSource = resolveDocTagSource(trimmedValue, trimmedOriginal);
    const leadingWhitespaceMatch = rawValue.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : "";
    const valueWithoutTrailingWhitespace = rawValue.replace(/\s+$/, "");
    const coreValue = valueWithoutTrailingWhitespace
        .slice(leadingWhitespace.length)
        .trim();

    return {
        comment,
        normalizedOptions,
        lineCommentOptions,
        original,
        trimmedOriginal,
        rawValue,
        trimmedValue,
        startsWithTripleSlash,
        isPlainTripleSlash,
        hasPrecedingLineBreak,
        hasInlineLeadingChar,
        isInlineComment,
        slashesMatch,
        leadingSlashCount,
        docContinuationMatch,
        docLikeMatch,
        docTagSource,
        leadingWhitespace,
        valueWithoutTrailingWhitespace,
        coreValue
    };
}

function resolveDocTagSource(
    trimmedValue: string,
    trimmedOriginal: string
): string | null {
    if (DOC_TAG_LINE_PREFIX_PATTERN.test(trimmedValue)) {
        return trimmedValue;
    }

    if (DOC_TAG_LINE_PREFIX_PATTERN.test(trimmedOriginal)) {
        return trimmedOriginal;
    }

    return null;
}

function shouldSuppressBoilerplate(
    context: LineCommentContext,
    fragments: ReadonlyArray<string>
) {
    for (const fragment of fragments) {
        if (context.trimmedValue.includes(fragment)) {
            return true;
        }
    }
    return false;
}

function handleHighSlashBanner(context: LineCommentContext) {
    const { slashesMatch, trimmedValue, trimmedOriginal, comment } = context;
    if (
        !slashesMatch ||
        slashesMatch[1].length < LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES
    ) {
        return undefined;
    }

    const afterStripping = trimmedValue.replace(/^\/+\s*/, "").trimStart();
    if (afterStripping.startsWith("@")) {
        const formatted = Core.applyJsDocReplacements(
            `/// ${afterStripping}`
        );
        return applyInlinePadding(comment, formatted);
    }

    const contentWithoutSlashes = trimmedValue.replace(/^\/+\s*/, "");
    const hasDecorations =
        LEADING_BANNER_DECORATION_PATTERN.test(contentWithoutSlashes) ||
        TRAILING_BANNER_DECORATION_PATTERN.test(contentWithoutSlashes) ||
        (contentWithoutSlashes.match(INNER_BANNER_DECORATION_PATTERN) || [])
            .length > 0;

    if (
        !hasDecorations &&
        slashesMatch[1].length === LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES
    ) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    const bannerContent = normalizeBannerCommentText(trimmedValue);
    if (bannerContent) {
        return applyInlinePadding(comment, `// ${bannerContent}`);
    }

    const contentAfterStripping = trimmedValue.replace(/^\/+\s*/, "");
    if (contentAfterStripping.length === 0 && trimmedValue.length > 0) {
        return "";
    }

    return applyInlinePadding(comment, trimmedOriginal);
}

function handleDecoratedBanner(context: LineCommentContext) {
    const { slashesMatch, trimmedValue, trimmedOriginal, comment, isPlainTripleSlash } =
        context;
    if (!slashesMatch || isPlainTripleSlash) {
        return undefined;
    }

    if (trimmedValue.startsWith("/") && !trimmedValue.startsWith("//")) {
        const remainder = trimmedValue.slice(1);
        if (remainder.trim().startsWith("@")) {
            const shouldInsertSpace =
                remainder.length > 0 &&
                /\w/.test(remainder.charAt(1) || "");
            const formatted = Core.applyJsDocReplacements(
                `///${shouldInsertSpace ? " " : ""}${remainder}`
            );
            return applyInlinePadding(comment, formatted as string);
        }
        return undefined;
    }

    const bannerContent = normalizeBannerCommentText(trimmedValue);
    if (bannerContent) {
        return applyInlinePadding(comment, `// ${bannerContent}`);
    }

    return undefined;
}

function handleInlineTripleSlashDoc(context: LineCommentContext) {
    if (!context.isInlineComment || !context.isPlainTripleSlash) {
        return undefined;
    }

    const remainder = context.trimmedOriginal.slice(3).trimStart();
    const formatted = remainder.length > 0 ? `// ${remainder}` : "//";
    return applyInlinePadding(context.comment, formatted);
}

function handlePlainTripleSlashNumeric(context: LineCommentContext) {
    if (!context.isPlainTripleSlash) {
        return undefined;
    }

    const remainder = context.trimmedOriginal.slice(3).trimStart();

    if (
        Core.isObjectLike(context.comment) &&
        (context.comment as any)?.isBottomComment === true &&
        /^\d/.test(remainder)
    ) {
        const formatted = remainder.length > 0 ? `// ${remainder}` : "//";
        return applyInlinePadding(context.comment, formatted);
    }

    if (!context.isInlineComment && /^\d+\s*[).:-]/.test(remainder)) {
        const formatted = `// ${remainder}`;
        return applyInlinePadding(context.comment, formatted);
    }

    return undefined;
}

function handlePlainTripleSlashBannerPreservation(context: LineCommentContext) {
    if (
        context.isPlainTripleSlash &&
        context.leadingSlashCount >= LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES &&
        !context.isInlineComment
    ) {
        return applyInlinePadding(context.comment, context.trimmedOriginal);
    }
}

function handleDocContinuation(context: LineCommentContext) {
    if (
        context.docContinuationMatch &&
        context.isPlainTripleSlash &&
        !context.isInlineComment
    ) {
        return applyInlinePadding(context.comment, context.trimmedOriginal);
    }
}

function handleSlashDocPromotion(context: LineCommentContext) {
    const { trimmedOriginal, comment } = context;

    if (
        trimmedOriginal.startsWith("///") ||
        !trimmedOriginal.startsWith("/") ||
        !trimmedOriginal.includes("@")
    ) {
        return undefined;
    }

    const afterSlashes = trimmedOriginal.replace(/^\/+\s*/, "");
    if (!afterSlashes.startsWith("@")) {
        return undefined;
    }

    const shouldInsertSpace =
        afterSlashes.length > 0 &&
        /\w/.test(afterSlashes.charAt(1) || "");
    const formatted = Core.applyJsDocReplacements(
        `///${shouldInsertSpace ? " " : ""}${afterSlashes}`
    );
    return applyInlinePadding(comment, formatted);
}

function handleDocLikePrefix(context: LineCommentContext) {
    if (!context.docLikeMatch) {
        return undefined;
    }

    const remainder = context.trimmedOriginal
        .slice(context.docLikeMatch[0].length)
        .trimStart();

    if (
        remainder.startsWith("//") ||
        (Core.isObjectLike(context.comment) &&
            typeof (context.comment as any).value === "string" &&
            /^\s*\/\//.test((context.comment as any).value))
    ) {
        const inner = remainder.startsWith("//")
            ? remainder
            : (context.comment as any).value.trimStart();
        const padded = `//     ${inner}`;
        return applyInlinePadding(context.comment, padded);
    }

    const formatted = `///${remainder.length > 0 ? ` ${remainder}` : ""}`;
    return applyInlinePadding(context.comment, formatted);
}

function handleDocTagLine(context: LineCommentContext) {
    if (!context.docTagSource) {
        return undefined;
    }

    let formattedCommentLine = `///${context.docTagSource.replace(
        DOC_TAG_LINE_PREFIX_PATTERN,
        " @"
    )}`;
    formattedCommentLine = Core.applyJsDocReplacements(
        formattedCommentLine
    ) as string;
    return applyInlinePadding(context.comment, formattedCommentLine);
}

function handleCommentedOutCode(context: LineCommentContext) {
    const { trimmedValue, coreValue, leadingWhitespace } = context;
    const patterns = context.normalizedOptions.codeDetectionPatterns;

    if (
        coreValue.length === 0 ||
        !(trimmedValue.startsWith("//") ||
            looksLikeCommentedOutCode(coreValue, patterns))
    ) {
        return undefined;
    }

    return applyInlinePadding(
        context.comment,
        `//${leadingWhitespace}${coreValue}`,
        true
    );
}

function handleMultiSentenceComment(context: LineCommentContext) {
    if (context.isInlineComment) {
        return undefined;
    }

    const sentences = splitCommentIntoSentences(context.trimmedValue);
    if (sentences.length <= 1) {
        return undefined;
    }

    const continuationIndent = extractContinuationIndentation(context.comment);
    const formattedSentences = sentences.map((sentence, index) => {
        const line = applyInlinePadding(context.comment, `// ${sentence}`);
        return index === 0 ? line : continuationIndent + line;
    });
    return formattedSentences.join("\n");
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
