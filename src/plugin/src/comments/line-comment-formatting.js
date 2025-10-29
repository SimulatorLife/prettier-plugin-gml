import {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    normalizeLineCommentOptions
} from "../options/line-comment-options.js";
import { isObjectLike } from "./comment-boundary.js";
import { getCommentValue } from "@prettier-plugin-gml/shared/ast/comments.js";
import {
    getNonEmptyTrimmedString,
    trimStringEntries,
    toTrimmedString
} from "@prettier-plugin-gml/shared/utils/string.js";
import { isRegExpLike } from "@prettier-plugin-gml/shared/utils/capability-probes.js";
import { createResolverController } from "@prettier-plugin-gml/shared/utils/resolver-controller.js";
import { normalizeOptionalParamToken } from "./optional-param-normalization.js";

const objectPrototypeHasOwnProperty = Object.prototype.hasOwnProperty;

function hasOwn(object, property) {
    return objectPrototypeHasOwnProperty.call(object, property);
}

function normalizeEntryPair(entry) {
    if (Array.isArray(entry)) {
        return entry.length >= 2 ? [entry[0], entry[1]] : null;
    }

    if (!entry || typeof entry !== "object") {
        return null;
    }

    if (hasOwn(entry, 0) && hasOwn(entry, 1)) {
        return [entry[0], entry[1]];
    }

    if (hasOwn(entry, "key") && hasOwn(entry, "value")) {
        return [entry.key, entry.value];
    }

    return null;
}

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

const DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION = Object.freeze({
    synonyms: Object.freeze([
        ["void", "undefined"],
        ["undefined", "undefined"],
        ["real", "real"],
        ["bool", "bool"],
        ["boolean", "boolean"],
        ["string", "string"],
        ["array", "array"],
        ["struct", "struct"],
        ["enum", "enum"],
        ["pointer", "pointer"],
        ["method", "method"],
        ["asset", "asset"],
        ["constant", "constant"],
        ["any", "any"],
        ["var", "var"],
        ["int64", "int64"],
        ["int32", "int32"],
        ["int16", "int16"],
        ["int8", "int8"],
        ["uint64", "uint64"],
        ["uint32", "uint32"],
        ["uint16", "uint16"],
        ["uint8", "uint8"]
    ]),
    specifierPrefixes: Object.freeze([
        "asset",
        "constant",
        "enum",
        "id",
        "struct"
    ]),
    canonicalSpecifierNames: Object.freeze([
        ["asset", "Asset"],
        ["constant", "constant"],
        ["enum", "Enum"],
        ["id", "Id"],
        ["struct", "Struct"]
    ])
});

const docCommentTypeNormalizationController = createResolverController({
    defaultFactory: () => createDocCommentTypeNormalization(),
    invoke(resolver, options) {
        return resolver({
            defaults: DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION,
            options
        });
    },
    normalize(result) {
        return createDocCommentTypeNormalization(result);
    },
    errorMessage:
        "Doc comment type normalization resolvers must be functions that return a normalization descriptor"
});

function createDocCommentTypeNormalization(candidate) {
    const synonyms = new Map();
    for (const [key, value] of DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.synonyms) {
        synonyms.set(key.toLowerCase(), value);
    }

    const canonicalSpecifierNames = new Map();
    for (const [key, value] of DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.canonicalSpecifierNames) {
        canonicalSpecifierNames.set(key.toLowerCase(), value);
    }

    const specifierPrefixes = new Set(
        DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.specifierPrefixes.map((value) =>
            value.toLowerCase()
        )
    );

    if (candidate && typeof candidate === "object") {
        mergeNormalizationEntries(synonyms, candidate.synonyms);
        mergeNormalizationEntries(canonicalSpecifierNames, candidate.canonicalSpecifierNames);
        mergeSpecifierPrefixes(specifierPrefixes, candidate.specifierPrefixes);
    }

    return Object.freeze({
        lookupTypeIdentifier(identifier) {
            const normalized = getNonEmptyTrimmedString(identifier);
            if (!normalized) {
                return null;
            }
            return synonyms.get(normalized.toLowerCase()) ?? null;
        },
        getCanonicalSpecifierName(identifier) {
            const normalized = getNonEmptyTrimmedString(identifier);
            if (!normalized) {
                return null;
            }
            return canonicalSpecifierNames.get(normalized.toLowerCase()) ?? null;
        },
        hasSpecifierPrefix(identifier) {
            const normalized = getNonEmptyTrimmedString(identifier);
            if (!normalized) {
                return false;
            }
            return specifierPrefixes.has(normalized.toLowerCase());
        }
    });
}

function mergeNormalizationEntries(target, entries) {
    if (!entries) {
        return;
    }

    const iterable = getEntryIterable(entries);
    for (const [rawKey, rawValue] of iterable) {
        const key = getNonEmptyTrimmedString(rawKey);
        const value = getNonEmptyTrimmedString(rawValue);
        if (!key || !value) {
            continue;
        }
        target.set(key.toLowerCase(), value);
    }
}

function mergeSpecifierPrefixes(target, candidates) {
    if (!candidates) {
        return;
    }

    for (const candidate of toIterable(candidates)) {
        const normalized = getNonEmptyTrimmedString(candidate);
        if (!normalized) {
            continue;
        }
        target.add(normalized.toLowerCase());
    }
}

function tryGetEntriesIterator(candidate) {
    if (
        !candidate ||
        Array.isArray(candidate) ||
        (typeof candidate !== "object" && typeof candidate !== "function")
    ) {
        return null;
    }

    const { entries } = candidate;
    if (typeof entries !== "function") {
        return null;
    }

    try {
        const iterator = entries.call(candidate);
        if (iterator && typeof iterator[Symbol.iterator] === "function") {
            return iterator;
        }
    } catch {
        return null;
    }

    return null;
}

function* getEntryIterable(value) {
    if (!value) {
        return;
    }

    const entriesIterator = tryGetEntriesIterator(value);
    if (entriesIterator) {
        for (const entry of entriesIterator) {
            const pair = normalizeEntryPair(entry);
            if (pair) {
                yield pair;
            }
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            const pair = normalizeEntryPair(entry);
            if (pair) {
                yield pair;
            }
        }
        return;
    }

    if (typeof value === "object") {
        yield* Object.entries(value);
    }
}

function* toIterable(value) {
    if (value === undefined || value === null) {
        return;
    }

    if (typeof value === "string") {
        yield value;
        return;
    }

    if (typeof value[Symbol.iterator] === "function") {
        yield* value;
        return;
    }

    if (typeof value === "object") {
        yield* Object.values(value);
    }
}

function resolveDocCommentTypeNormalization(options = {}) {
    return docCommentTypeNormalizationController.resolve(options);
}

function setDocCommentTypeNormalizationResolver(resolver) {
    return docCommentTypeNormalizationController.set(resolver);
}

function restoreDefaultDocCommentTypeNormalizationResolver() {
    return docCommentTypeNormalizationController.restore();
}

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
    const { boilerplateFragments, codeDetectionPatterns } = normalizedOptions;
    const original = getLineCommentRawText(comment);
    const trimmedOriginal = original.trim();
    const rawValue = getCommentValue(comment);
    const trimmedValue = getCommentValue(comment, { trim: true });

    const leadingSlashMatch = trimmedOriginal.match(/^\/+/);
    const leadingSlashCount = leadingSlashMatch
        ? leadingSlashMatch[0].length
        : 0;

    for (const lineFragment of boilerplateFragments) {
        if (trimmedValue.includes(lineFragment)) {
            return "";
        }
    }

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

    const slashesMatch = original.match(/^\s*(\/{2,})(.*)$/);
    if (
        slashesMatch &&
        slashesMatch[1].length >= LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES
    ) {
        return applyInlinePadding(comment, original.trim());
    }

    if (
        isInlineComment &&
        trimmedOriginal.startsWith("///") &&
        !trimmedOriginal.includes("@")
    ) {
        const remainder = trimmedOriginal.slice(3).trimStart();
        const formatted = remainder.length > 0 ? `// ${remainder}` : "//";
        return applyInlinePadding(comment, formatted);
    }

    if (
        trimmedOriginal.startsWith("///") &&
        !trimmedOriginal.includes("@") &&
        leadingSlashCount >= LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES &&
        !isInlineComment
    ) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    const docContinuationMatch = trimmedValue.match(/^\/\s*(\S.*)$/);
    if (
        docContinuationMatch &&
        trimmedOriginal.startsWith("///") &&
        !trimmedOriginal.includes("@") &&
        !isInlineComment
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
    const paddingWidth = getInlinePaddingWidth(comment);

    if (paddingWidth <= 0) {
        return formattedText;
    }

    const shouldTrimTrailingPadding =
        comment?.trailing === true || comment?.placement === "endOfLine";
    const derivesFromFallback =
        typeof comment?.inlinePadding !== "number" || comment.inlinePadding <= 0;
    const shouldReduceFallbackPadding =
        shouldTrimTrailingPadding &&
        derivesFromFallback &&
        comment?.placement !== "endOfLine";
    const effectiveWidth = shouldReduceFallbackPadding
        ? Math.max(paddingWidth - 1, 0)
        : paddingWidth;

    if (effectiveWidth <= 0) {
        return formattedText;
    }

    return " ".repeat(effectiveWidth) + formattedText;
}

function getInlinePaddingWidth(comment) {
    if (!isObjectLike(comment)) {
        return 0;
    }

    const { inlinePadding } = comment;
    if (typeof inlinePadding === "number" && inlinePadding > 0) {
        return inlinePadding;
    }

    return getBottomTrailingInlinePadding(comment);
}

function getBottomTrailingInlinePadding(comment) {
    if (comment?.isBottomComment !== true) {
        return 0;
    }

    const isTrailingComment =
        comment.trailing === true || comment.placement === "endOfLine";
    if (!isTrailingComment) {
        return 0;
    }

    if (comment.leadingChar !== ";") {
        return 0;
    }

    const leadingWhitespace =
        typeof comment.leadingWS === "string" ? comment.leadingWS : "";
    if (leadingWhitespace.length >= 2) {
        return 0;
    }

    return 1;
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
    formattedText = normalizeFeatherOptionalParamSyntax(formattedText);

    return normalizeDocCommentTypeAnnotations(formattedText);
}

function normalizeFeatherOptionalParamSyntax(text) {
    if (typeof text !== "string" || !/@param\b/i.test(text)) {
        return text;
    }

    return text.replace(
        /(\s*\/\/\/\s*@param(?:\s+\{[^}]+\})?\s*)(\S+)/i,
        (match, prefix, token) =>
            `${prefix}${normalizeOptionalParamToken(token)}`
    );
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

    const docCommentTypeNormalization = resolveDocCommentTypeNormalization();
    const segments = [];
    const tokenPattern = /([A-Za-z_][A-Za-z0-9_]*)|([^A-Za-z_]+)/g;
    let match;

    while ((match = tokenPattern.exec(typeText)) !== null) {
        if (match[1]) {
            const identifier = match[1];
            const normalizedIdentifier =
                docCommentTypeNormalization.lookupTypeIdentifier(identifier) ??
                identifier;
            segments.push({
                type: "identifier",
                value: normalizedIdentifier
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

    const isDotSeparatedTypeSpecifierPrefix = (prefixIndex) => {
        let sawDot = false;

        for (
            let index = prefixIndex + 1;
            index < segments.length;
            index += 1
        ) {
            const candidate = segments[index];
            if (!candidate) {
                continue;
            }

            if (candidate.type === "separator") {
                const trimmed = getNonEmptyTrimmedString(candidate.value);

                if (!trimmed) {
                    continue;
                }

                if (trimmed.startsWith(".")) {
                    sawDot = true;
                    continue;
                }

                return false;
            }

            if (candidate.type === "identifier") {
                return sawDot;
            }

            return false;
        }

        return false;
    };

    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) {
            continue;
        }

        if (segment.type === "identifier") {
            let normalizedValue = segment.value;

            if (typeof normalizedValue === "string") {
                const canonicalPrefix =
                    docCommentTypeNormalization.getCanonicalSpecifierName(
                        normalizedValue
                    );

                if (canonicalPrefix && isDotSeparatedTypeSpecifierPrefix(index)) {
                    normalizedValue = canonicalPrefix;
                }
            }

            outputSegments.push(normalizedValue);
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

            if (
                docCommentTypeNormalization.hasSpecifierPrefix(previousIdentifier)
            ) {
                const canonicalPrefix =
                    docCommentTypeNormalization.getCanonicalSpecifierName(
                        previousIdentifier
                    );
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
    const trimmed = toTrimmedString(text);
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
    const segments = trimStringEntries(text.split(splitPattern)).filter(
        (segment) => segment.length > 0
    );

    return segments.length > 0 ? segments : [text];
}

export {
    DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION,
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText,
    normalizeDocCommentTypeAnnotations,
    resolveDocCommentTypeNormalization,
    restoreDefaultDocCommentTypeNormalizationResolver,
    setDocCommentTypeNormalizationResolver
};
