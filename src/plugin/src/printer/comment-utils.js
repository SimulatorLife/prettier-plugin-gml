const DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD = 4;

const BOILERPLATE_COMMENTS = [
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information"
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

function coercePositiveIntegerOption(value, defaultValue, { zeroReplacement } = {}) {
    if (typeof value === "number" && Number.isFinite(value)) {
        const normalized = Math.floor(value);

        if (normalized > 0) {
            return normalized;
        }

        if (zeroReplacement !== undefined && normalized <= 0) {
            return zeroReplacement;
        }
    }

    return defaultValue;
}

function getLineCommentBannerMinimum(options) {
    return coercePositiveIntegerOption(
        options?.lineCommentBannerMinimumSlashes,
        DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES
    );
}

function getLineCommentBannerAutofillThreshold(options) {
    return coercePositiveIntegerOption(
        options?.lineCommentBannerAutofillThreshold,
        DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD,
        {
            zeroReplacement: Number.POSITIVE_INFINITY
        }
    );
}

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
    "@private": "@hide"
    // Add more replacements here as needed
};

// Cache the replacement rules so applyJsDocReplacements avoids constructing
// new RegExp instances on every invocation. The helper is on a hot path while
// formatting doc-style comments.
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

function isCommentNode(node) {
    return (
        node &&
        typeof node === "object" &&
        (node.type === "CommentBlock" || node.type === "CommentLine")
    );
}

function formatLineComment(comment, bannerMinimumSlashes = DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES) {
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
    if (slashesMatch && slashesMatch[1].length >= bannerMinimumSlashes) {
        return applyInlinePadding(comment, original.trim());
    }

    if (
        trimmedOriginal.startsWith("///") &&
        !trimmedOriginal.includes("@") &&
        leadingSlashCount >= bannerMinimumSlashes
    ) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    const docLikeMatch = trimmedValue.match(/^\/\s*(.*)$/);
    if (docLikeMatch) {
        const remainder = docLikeMatch[1] ?? "";
        // comments like "// comment" should stay as regular comments, so bail out when the
        // remainder begins with another slash
        if (!remainder.startsWith("/")) {
            const shouldInsertSpace = remainder.length > 0 && /\w/.test(remainder);
            const formatted = applyJsDocReplacements(`///${shouldInsertSpace ? " " : ""}${remainder}`);
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
    const sentences = !isInlineComment ? splitCommentIntoSentences(trimmedValue) : [trimmedValue];
    if (sentences.length > 1) {
        const formattedSentences = sentences.map((sentence) =>
            applyInlinePadding(comment, `// ${sentence}`)
        );
        return formattedSentences.join("\n");
    }

    const leadingWhitespaceMatch = rawValue.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : "";
    const valueWithoutTrailingWhitespace = rawValue.replace(/\s+$/, "");
    const coreValue = valueWithoutTrailingWhitespace.slice(leadingWhitespace.length).trim();

    if (coreValue.length > 0 && (trimmedValue.startsWith("//") || looksLikeCommentedOutCode(coreValue))) {
        return applyInlinePadding(comment, `//${leadingWhitespace}${coreValue}`);
    }

    return applyInlinePadding(comment, "// " + trimmedValue);
}

function looksLikeCommentedOutCode(text) {
    if (typeof text !== "string") {
        return false;
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return false;
    }

    if (/^(?:if|else|for|while|switch|do|return|break|continue|repeat|with|var|global|enum|function)\b/i.test(trimmed)) {
        return true;
    }

    if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\.|\(|\[|=)/.test(trimmed)) {
        return true;
    }

    if (/^[{}()[\].]/.test(trimmed)) {
        return true;
    }

    if (/^#/.test(trimmed)) {
        return true;
    }

    if (/^@/.test(trimmed)) {
        return true;
    }

    return false;
}

function applyInlinePadding(comment, formattedText) {
    if (
        comment &&
        typeof comment.inlinePadding === "number" &&
        comment.inlinePadding > 0 &&
        formattedText.startsWith("//")
    ) {
        return " ".repeat(comment.inlinePadding) + formattedText;
    }

    return formattedText;
}

function applyJsDocReplacements(text) {
    let formattedText = /@/i.test(text)
        ? text.replace(/\(\)\s*$/, "")
        : text;

    for (const { regex, replacement } of JSDOC_REPLACEMENT_RULES) {
        regex.lastIndex = 0;
        formattedText = formattedText.replace(regex, `$1${replacement}`);
    }

    formattedText = stripTrailingFunctionParameters(formattedText);

    return normalizeDocCommentTypeAnnotations(formattedText);
}

const FUNCTION_SIGNATURE_PATTERN = /(^|\n)(\s*\/\/\/\s*@function\b[^\r\n]*?)(\s*\([^\)]*\))(\s*(?=\r?\n|$))/gi;

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
        const normalized = GAME_MAKER_TYPE_NORMALIZATIONS.get(identifier.toLowerCase());
        return normalized ?? identifier;
    });
}

function splitCommentIntoSentences(text) {
    if (!text || !text.includes(". ")) {
        return [text];
    }

    const splitPattern = /(?<=\.)\s+(?=[A-Z])/g;
    const segments = text.split(splitPattern)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

    return segments.length > 0 ? segments : [text];
}

export {
    getLineCommentRawText,
    formatLineComment,
    getLineCommentBannerMinimum,
    getLineCommentBannerAutofillThreshold,
    applyInlinePadding,
    normalizeDocCommentTypeAnnotations,
    isCommentNode
};

