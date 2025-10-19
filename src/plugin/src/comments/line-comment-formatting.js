import {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    normalizeLineCommentOptions
} from "../options/line-comment-options.js";
import { isObjectLike } from "./comment-boundary.js";
import { isRegExpLike } from "../../../shared/utils/capability-probes.js";

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

const TYPE_SPECIFIER_PREFIXES = new Set([
    "asset",
    "constant",
    "enum",
    "id",
    "struct"
]);

const TYPE_SPECIFIER_CANONICAL_NAMES = new Map(
    Object.entries({
        asset: "Asset",
        constant: "Constant",
        enum: "Enum",
        id: "Id",
        struct: "Struct"
    })
);

const FUNCTION_LIKE_DOC_TAG_PATTERN = /@(func(?:tion)?|method)\b/i;

const FUNCTION_SIGNATURE_PATTERN =
    /(^|\n)(\s*\/\/\/\s*@function\b[^\r\n]*?)(\s*\([^\)]*\))(\s*(?=\n|$))/gi;

// Hoist frequently used regular expressions so they are compiled once. The
// formatter hits these helpers while iterating over comment lists, so avoiding
// per-call RegExp construction keeps the hot path allocation-free.
const DOC_COMMENT_TYPE_PATTERN = /\{([^}]+)\}/g;
const DOC_TAG_LINE_PREFIX_PATTERN = /^\/+(\s*)@/;

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
    const { boilerplateFragments } = normalizedOptions;
    const codeDetectionPatterns =
        normalizedOptions.codeDetectionPatterns ??
        (lineCommentOptions && typeof lineCommentOptions === "object"
            ? lineCommentOptions.codeDetectionPatterns
            : undefined) ??
        DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
    const original = getLineCommentRawText(comment);
    const trimmedOriginal = original.trim();
    const hasStringValue = typeof comment?.value === "string";
    const rawValue = hasStringValue ? comment.value : "";
    const trimmedValue = hasStringValue ? comment.value.trim() : "";

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

    const slashesMatch = original.match(/^\s*(\/{2,})(.*)$/);
    if (
        slashesMatch &&
        slashesMatch[1].length >= LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES
    ) {
        return applyInlinePadding(comment, original.trim());
    }

    if (
        trimmedOriginal.startsWith("///") &&
        !trimmedOriginal.includes("@") &&
        leadingSlashCount >= LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES
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

    const match = trimmedValue.match(DOC_TAG_LINE_PREFIX_PATTERN);
    if (match) {
        let formattedCommentLine =
            "///" + trimmedValue.replace(DOC_TAG_LINE_PREFIX_PATTERN, " @");
        formattedCommentLine = applyJsDocReplacements(formattedCommentLine);
        return applyInlinePadding(comment, formattedCommentLine);
    }

    const isInlineComment =
        isObjectLike(comment) &&
        (typeof comment.inlinePadding === "number" ||
            comment.trailing === true ||
            comment.placement === "endOfLine");
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

    return text.replaceAll(
        FUNCTION_SIGNATURE_PATTERN,
        (match, linePrefix, functionPrefix) =>
            `${linePrefix}${functionPrefix.replace(/\s+$/, "")}`
    );
}

function normalizeDocCommentTypeAnnotations(text) {
    if (typeof text !== "string" || !text.includes("{")) {
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

    const segments = [];
    const tokenPattern = /([A-Za-z_][A-Za-z0-9_]*)|([^A-Za-z_]+)/g;
    let match;

    while ((match = tokenPattern.exec(typeText)) !== null) {
        if (match[1]) {
            const identifier = match[1];
            const normalizedIdentifier = GAME_MAKER_TYPE_NORMALIZATIONS.get(
                identifier.toLowerCase()
            );
            segments.push({
                type: "identifier",
                value: normalizedIdentifier ?? identifier
            });
            continue;
        }

        if (match[2]) {
            segments.push({ type: "separator", value: match[2] });
        }
    }

    const findNextNonWhitespaceSegment = (startIndex) => {
        for (let index = startIndex; index < segments.length; index += 1) {
            const segment = segments[index];
            if (
                segment &&
                segment.type === "separator" &&
                /^\s+$/.test(segment.value)
            ) {
                continue;
            }

            return segment ?? null;
        }

        return null;
    };

    const outputSegments = [];

    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) {
            continue;
        }

        if (segment.type === "identifier") {
            outputSegments.push(segment.value);
            continue;
        }

        const separatorValue = segment.value ?? "";
        if (separatorValue.length === 0) {
            continue;
        }

        if (/^\s+$/.test(separatorValue)) {
            const previous = segments[index - 1];
            const next = segments[index + 1];
            const nextToken = findNextNonWhitespaceSegment(index + 1);

            if (
                nextToken &&
                nextToken.type === "separator" &&
                /^[\[\(<>{})]/.test(nextToken.value.trim())
            ) {
                continue;
            }

            const previousIdentifier =
                previous && previous.type === "identifier"
                    ? previous.value
                    : null;
            const nextIdentifier =
                next && next.type === "identifier" ? next.value : null;

            if (!previousIdentifier || !nextIdentifier) {
                continue;
            }

            const previousKey = previousIdentifier.toLowerCase();
            if (TYPE_SPECIFIER_PREFIXES.has(previousKey)) {
                const canonicalPrefix =
                    TYPE_SPECIFIER_CANONICAL_NAMES.get(previousKey);
                if (canonicalPrefix && outputSegments.length > 0) {
                    outputSegments[outputSegments.length - 1] = canonicalPrefix;
                }
                outputSegments.push(".");
            } else {
                outputSegments.push(",");
            }

            continue;
        }

        let normalizedSeparator = separatorValue.replaceAll(/\s+/g, "");
        if (normalizedSeparator.length === 0) {
            continue;
        }

        normalizedSeparator = normalizedSeparator.replaceAll("|", ",");
        outputSegments.push(normalizedSeparator);
    }

    return outputSegments.join("");
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
        if (!isRegExpLike(pattern)) {
            continue;
        }

        if (typeof pattern.lastIndex === "number") {
            pattern.lastIndex = 0;
        }

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
