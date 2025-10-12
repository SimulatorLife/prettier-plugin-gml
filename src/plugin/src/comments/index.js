import {
    collectCommentNodes,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment
} from "../../../shared/comments.js";
import { coercePositiveIntegerOption } from "../printer/option-utils.js";

const DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD = 4;
const DEFAULT_TRAILING_COMMENT_PADDING = 2;
const DEFAULT_TRAILING_COMMENT_INLINE_OFFSET = 1;

const DEFAULT_LINE_COMMENT_OPTIONS = Object.freeze({
    bannerMinimum: DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES,
    bannerAutofillThreshold: DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD
});

function buildLineCommentOptions(bannerMinimum, bannerAutofillThreshold) {
    return {
        bannerMinimum,
        bannerAutofillThreshold
    };
}

function readLineCommentOption(value, fallback) {
    return typeof value === "number" ? value : fallback;
}

const LINE_COMMENT_OPTIONS_CACHE_KEY = Symbol("lineCommentOptions");
const lineCommentOptionsCache = new WeakMap();

function resolveLineCommentOptions(options) {
    if (typeof options !== "object" || options === null) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    const {
        lineCommentBannerMinimumSlashes,
        lineCommentBannerAutofillThreshold
    } = options;

    if (
        lineCommentBannerMinimumSlashes === undefined &&
    lineCommentBannerAutofillThreshold === undefined
    ) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    const symbolCachedOptions = options[LINE_COMMENT_OPTIONS_CACHE_KEY];
    if (symbolCachedOptions) {
        return symbolCachedOptions;
    }

    const cachedOptions = lineCommentOptionsCache.get(options);
    if (cachedOptions) {
        return cachedOptions;
    }

    const bannerMinimum = coercePositiveIntegerOption(
        lineCommentBannerMinimumSlashes,
        DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES
    );

    const bannerAutofillThreshold = coercePositiveIntegerOption(
        lineCommentBannerAutofillThreshold,
        DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD,
        {
            zeroReplacement: Number.POSITIVE_INFINITY
        }
    );

    const resolvedOptions = buildLineCommentOptions(
        bannerMinimum,
        bannerAutofillThreshold
    );

    if (Object.isExtensible(options)) {
        Object.defineProperty(options, LINE_COMMENT_OPTIONS_CACHE_KEY, {
            value: resolvedOptions,
            configurable: false,
            enumerable: false,
            writable: false
        });
    } else {
        lineCommentOptionsCache.set(options, resolvedOptions);
    }

    return resolvedOptions;
}

function getTrailingCommentPadding(options) {
    return coercePositiveIntegerOption(
        options?.trailingCommentPadding,
        DEFAULT_TRAILING_COMMENT_PADDING,
        { zeroReplacement: 0 }
    );
}

function getTrailingCommentInlinePadding(options) {
    const padding = getTrailingCommentPadding(options);
    const inlineOffset = coercePositiveIntegerOption(
        options?.trailingCommentInlineOffset,
        DEFAULT_TRAILING_COMMENT_INLINE_OFFSET,
        { zeroReplacement: 0 }
    );
    return Math.max(padding - inlineOffset, 0);
}

const BOILERPLATE_COMMENTS = [
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information"
];

const JSDOC_REPLACEMENTS = {
    "@func": "@function",
    "@method": "@function",
    "@yield": "@returns",
    "@yields": "@returns",
    "@return": "@returns",
    "@desc": "@description",
    "@arg": "@param",
    "@argument": "@param",
    "@overrides": "@override",
    "@exception": "@throws",
    "@throw": "@throws",
    "@private": "@hide",
    "@hidden": "@hide"
};

const JSDOC_REPLACEMENT_RULES = Object.entries(JSDOC_REPLACEMENTS).map(
    ([oldWord, newWord]) => ({
        regex: new RegExp(`(\/\/\/\\s*)${oldWord}\\b`, "gi"),
        replacement: newWord
    })
);

const GAME_MAKER_TYPE_NORMALIZATIONS = new Map(
    Object.entries({
        void: "undefined",
        undefined: "undefined",
        real: "real",
        bool: "bool",
        boolean: "boolean",
        string: "string",
        array: "array",
        struct: "struct",
        enum: "enum",
        pointer: "pointer",
        method: "method",
        asset: "asset",
        any: "any",
        var: "var",
        int64: "int64",
        int32: "int32",
        int16: "int16",
        int8: "int8",
        uint64: "uint64",
        uint32: "uint32",
        uint16: "uint16",
        uint8: "uint8"
    })
);

const COMMENTED_OUT_CODE_PATTERNS = [
    /^(?:if|else|for|while|switch|do|return|break|continue|repeat|with|var|global|enum|function)\b/i,
    /^[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\.|\(|\[|=)/,
    /^[{}()[\].]/,
    /^#/,
    /^@/
];

function getLineCommentRawText(comment) {
    if (!comment || typeof comment !== "object") {
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

function formatLineComment(
    comment,
    lineCommentOptions = DEFAULT_LINE_COMMENT_OPTIONS
) {
    const { bannerMinimum } = normalizeLineCommentOptions(lineCommentOptions);
    const original = getLineCommentRawText(comment);
    const trimmedOriginal = original.trim();
    const trimmedValue = comment.value.trim();
    const rawValue = typeof comment.value === "string" ? comment.value : "";

    const leadingSlashMatch = trimmedOriginal.match(/^\/+/);
    const leadingSlashCount = leadingSlashMatch ? leadingSlashMatch[0].length : 0;

    for (const lineFragment of BOILERPLATE_COMMENTS) {
        if (trimmedValue.includes(lineFragment)) {
            console.log(`Removed boilerplate comment: ${lineFragment}`);
            return "";
        }
    }

    const slashesMatch = original.match(/^\s*(\/\/+)(.*)$/);
    if (slashesMatch && slashesMatch[1].length >= bannerMinimum) {
        return applyInlinePadding(comment, original.trim());
    }

    if (
        trimmedOriginal.startsWith("///") &&
    !trimmedOriginal.includes("@") &&
    leadingSlashCount >= bannerMinimum
    ) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    const docContinuationMatch = trimmedValue.match(/^\/\s*(\S.*)$/);
    if (
        docContinuationMatch &&
    trimmedOriginal.startsWith("///") &&
    !trimmedOriginal.includes("@")
    ) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    const docLikeMatch = trimmedValue.match(/^\/\s*(.*)$/);
    if (docLikeMatch) {
        const remainder = docLikeMatch[1] ?? "";
        if (!remainder.startsWith("/")) {
            const shouldInsertSpace = remainder.length > 0 && /\w/.test(remainder);
            const formatted = applyJsDocReplacements(
                `///${shouldInsertSpace ? " " : ""}${remainder}`
            );
            return applyInlinePadding(comment, formatted);
        }
    }

    const regexPattern = /^\/+(\s*)@/;
    const match = trimmedValue.match(regexPattern);
    if (match) {
        let formattedCommentLine = "///" + trimmedValue.replace(regexPattern, " @");
        formattedCommentLine = applyJsDocReplacements(formattedCommentLine);
        return applyInlinePadding(comment, formattedCommentLine);
    }

    const isInlineComment = comment && typeof comment.inlinePadding === "number";
    const sentences = !isInlineComment
        ? splitCommentIntoSentences(trimmedValue)
        : [trimmedValue];
    if (sentences.length > 1) {
        const formattedSentences = sentences.map((sentence) =>
            applyInlinePadding(comment, `// ${sentence}`)
        );
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
    (trimmedValue.startsWith("//") || looksLikeCommentedOutCode(coreValue))
    ) {
        return applyInlinePadding(comment, `//${leadingWhitespace}${coreValue}`);
    }

    return applyInlinePadding(comment, "// " + trimmedValue);
}

function normalizeLineCommentOptions(lineCommentOptions) {
    if (
        typeof lineCommentOptions === "number" &&
    Number.isFinite(lineCommentOptions)
    ) {
        return buildLineCommentOptions(
            lineCommentOptions,
            DEFAULT_LINE_COMMENT_OPTIONS.bannerAutofillThreshold
        );
    }

    if (lineCommentOptions && typeof lineCommentOptions === "object") {
        return buildLineCommentOptions(
            readLineCommentOption(
                lineCommentOptions.bannerMinimum,
                DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES
            ),
            readLineCommentOption(
                lineCommentOptions.bannerAutofillThreshold,
                DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD
            )
        );
    }

    return DEFAULT_LINE_COMMENT_OPTIONS;
}

function looksLikeCommentedOutCode(text) {
    if (typeof text !== "string") {
        return false;
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return false;
    }

    return COMMENTED_OUT_CODE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function applyInlinePadding(comment, formattedText) {
    if (
        comment &&
    typeof comment.inlinePadding === "number" &&
    comment.inlinePadding > 0
    ) {
        return " ".repeat(comment.inlinePadding) + formattedText;
    }

    return formattedText;
}

const FUNCTION_LIKE_DOC_TAG_PATTERN = /@(func(?:tion)?|method)\b/i;

function applyJsDocReplacements(text) {
    const shouldStripEmptyParams =
    typeof text === "string" && FUNCTION_LIKE_DOC_TAG_PATTERN.test(text);

    let formattedText = shouldStripEmptyParams
        ? text.replace(/\(\)\s*$/, "")
        : text;

    for (const { regex, replacement } of JSDOC_REPLACEMENT_RULES) {
        regex.lastIndex = 0;
        formattedText = formattedText.replace(regex, `$1${replacement}`);
    }

    formattedText = stripTrailingFunctionParameters(formattedText);

    return normalizeDocCommentTypeAnnotations(formattedText);
}

const FUNCTION_SIGNATURE_PATTERN =
  /(^|\n)(\s*\/\/\/\s*@function\b[^\r\n]*?)(\s*\([^\)]*\))(\s*(?=\r?\n|$))/gi;

function stripTrailingFunctionParameters(text) {
    if (typeof text !== "string" || !/@function\b/i.test(text)) {
        return text;
    }

    return text.replace(
        FUNCTION_SIGNATURE_PATTERN,
        (match, linePrefix, functionPrefix) =>
            `${linePrefix}${functionPrefix.replace(/\s+$/, "")}`
    );
}

function normalizeDocCommentTypeAnnotations(text) {
    if (typeof text !== "string" || text.indexOf("{") === -1) {
        return text;
    }

    return text.replace(/\{([^}]+)\}/g, (match, typeText) => {
        const normalized = normalizeGameMakerType(typeText);
        return `{${normalized}}`;
    });
}

function normalizeGameMakerType(typeText) {
    if (typeof typeText !== "string") {
        return typeText;
    }

    return typeText.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (identifier) => {
        const normalized = GAME_MAKER_TYPE_NORMALIZATIONS.get(
            identifier.toLowerCase()
        );
        return normalized ?? identifier;
    });
}

function splitCommentIntoSentences(text) {
    if (!text || !text.includes(". ")) {
        return [text];
    }

    const splitPattern = /(?<=\.)\s+(?=[A-Z])/g;
    const segments = text
        .split(splitPattern)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

    return segments.length > 0 ? segments : [text];
}

export {
    applyInlinePadding,
    collectCommentNodes,
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_TRAILING_COMMENT_PADDING,
    DEFAULT_TRAILING_COMMENT_INLINE_OFFSET,
    formatLineComment,
    getLineCommentRawText,
    getTrailingCommentInlinePadding,
    getTrailingCommentPadding,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment,
    normalizeDocCommentTypeAnnotations,
    resolveLineCommentOptions
};
