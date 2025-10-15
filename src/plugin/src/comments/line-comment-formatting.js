import {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    normalizeLineCommentOptions
} from "../options/line-comment-options.js";
import { isObjectLike } from "../../../shared/object-utils.js";

const JSDOC_REPLACEMENTS = {
    "@func": "@function",
    "@method": "@function",
    "@yield": "@returns",
    "@yields": "@returns",
    "@return": "@returns",
    "@output": "@returns",
    "@outputs": "@returns",
    "@desc": "@description",
    "@arg": "@param",
    "@argument": "@param",
    "@params": "@param",
    "@overrides": "@override",
    "@overide": "@override",
    "@overridden": "@override",
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

const FUNCTION_LIKE_DOC_TAG_PATTERN = /@(func(?:tion)?|method)\b/i;

const FUNCTION_SIGNATURE_PATTERN =
    /(^|\n)(\s*\/\/\/\s*@function\b[^\r\n]*?)(\s*\([^\)]*\))(\s*(?=\r?\n|$))/gi;

// Hoist frequently used regular expressions so they are compiled once. The
// formatter hits these helpers while iterating over comment lists, so avoiding
// per-call RegExp construction keeps the hot path allocation-free.
const DOC_COMMENT_TYPE_PATTERN = /\{([^}]+)\}/g;
const TYPE_IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;

function getLineCommentRawText(comment) {
    if (!isObjectLike(comment)) {
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
    const normalizedOptions = normalizeLineCommentOptions(lineCommentOptions);
    const { bannerMinimum, boilerplateFragments } = normalizedOptions;
    const codeDetectionPatterns =
        normalizedOptions.codeDetectionPatterns ??
        (lineCommentOptions && typeof lineCommentOptions === "object"
            ? lineCommentOptions.codeDetectionPatterns
            : undefined) ??
        DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
    const original = getLineCommentRawText(comment);
    const trimmedOriginal = original.trim();
    const trimmedValue = comment.value.trim();
    const rawValue = typeof comment.value === "string" ? comment.value : "";

    const leadingSlashMatch = trimmedOriginal.match(/^\/+/);
    const leadingSlashCount = leadingSlashMatch
        ? leadingSlashMatch[0].length
        : 0;

    for (const lineFragment of boilerplateFragments) {
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
            const shouldInsertSpace =
                remainder.length > 0 && /\w/.test(remainder);
            const formatted = applyJsDocReplacements(
                `///${shouldInsertSpace ? " " : ""}${remainder}`
            );
            return applyInlinePadding(comment, formatted);
        }
    }

    const regexPattern = /^\/+(\s*)@/;
    const match = trimmedValue.match(regexPattern);
    if (match) {
        let formattedCommentLine =
            "///" + trimmedValue.replace(regexPattern, " @");
        formattedCommentLine = applyJsDocReplacements(formattedCommentLine);
        return applyInlinePadding(comment, formattedCommentLine);
    }

    const isInlineComment =
        isObjectLike(comment) && typeof comment.inlinePadding === "number";
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
        (trimmedValue.startsWith("//") ||
            looksLikeCommentedOutCode(coreValue, codeDetectionPatterns))
    ) {
        return applyInlinePadding(
            comment,
            `//${leadingWhitespace}${coreValue}`
        );
    }

    return applyInlinePadding(comment, "// " + trimmedValue);
}

function applyInlinePadding(comment, formattedText) {
    if (!isObjectLike(comment)) {
        return formattedText;
    }

    const { inlinePadding } = comment;
    if (typeof inlinePadding === "number" && inlinePadding > 0) {
        return " ".repeat(inlinePadding) + formattedText;
    }

    return formattedText;
}

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

    DOC_COMMENT_TYPE_PATTERN.lastIndex = 0;
    return text.replace(DOC_COMMENT_TYPE_PATTERN, (match, typeText) => {
        const normalized = normalizeGameMakerType(typeText);
        return `{${normalized}}`;
    });
}

function normalizeGameMakerType(typeText) {
    if (typeof typeText !== "string") {
        return typeText;
    }

    TYPE_IDENTIFIER_PATTERN.lastIndex = 0;
    const withNormalizedIdentifiers = typeText.replace(
        TYPE_IDENTIFIER_PATTERN,
        (identifier) => {
            const normalized = GAME_MAKER_TYPE_NORMALIZATIONS.get(
                identifier.toLowerCase()
            );
            return normalized ?? identifier;
        }
    );

    return normalizeGameMakerTypeDelimiters(withNormalizedIdentifiers);
}

function normalizeGameMakerTypeDelimiters(typeText) {
    if (typeof typeText !== "string") {
        return typeText;
    }

    let normalized = typeText.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) {
        return normalized;
    }

    normalized = normalized.replace(
        /\b(Id|Constant|Asset|Struct)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi,
        (match, base, suffix) => `${base}.${suffix}`
    );

    let squareDepth = 0;
    let angleDepth = 0;
    let parenDepth = 0;
    let result = "";

    for (let index = 0; index < normalized.length; ) {
        const char = normalized[index];

        if (/\s/.test(char)) {
            while (index < normalized.length && /\s/.test(normalized[index])) {
                index += 1;
            }

            const nextChar = normalized[index];
            const prevChar = result[result.length - 1];
            const atTopLevel =
                squareDepth === 0 && angleDepth === 0 && parenDepth === 0;
            const prevIsIdentifier = /[A-Za-z0-9_>\]]/.test(prevChar);
            const nextIsIdentifier = /[A-Za-z_]/.test(nextChar);

            if (atTopLevel && prevIsIdentifier && nextIsIdentifier) {
                result += ",";
            }

            continue;
        }

        result += char;

        switch (char) {
            case "[":
                squareDepth += 1;
                break;
            case "]":
                squareDepth = Math.max(0, squareDepth - 1);
                break;
            case "<":
                angleDepth += 1;
                break;
            case ">":
                angleDepth = Math.max(0, angleDepth - 1);
                break;
            case "(":
                parenDepth += 1;
                break;
            case ")":
                parenDepth = Math.max(0, parenDepth - 1);
                break;
            default:
                break;
        }

        index += 1;
    }

    return result;
}

function looksLikeCommentedOutCode(text, codeDetectionPatterns) {
    if (typeof text !== "string") {
        return false;
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return false;
    }

    const patterns = Array.isArray(codeDetectionPatterns)
        ? codeDetectionPatterns
        : DEFAULT_COMMENTED_OUT_CODE_PATTERNS;

    for (const pattern of patterns) {
        if (!(pattern instanceof RegExp)) {
            continue;
        }

        pattern.lastIndex = 0;
        if (pattern.test(trimmed)) {
            return true;
        }
    }

    return false;
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
    formatLineComment,
    getLineCommentRawText,
    normalizeDocCommentTypeAnnotations
};
