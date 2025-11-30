import {
    capitalize,
    createResolverController,
    getNonEmptyTrimmedString,
    isNonEmptyTrimmedString,
    toTrimmedString
} from "../utils/index.js";
import type { DocCommentLines } from "./comment-utils.js";
import { normalizeOptionalParamToken } from "./optional-param-normalization.js";

export type DocCommentMetadata = {
    tag: string;
    name?: string | null;
    type?: string | null;
};

const STRING_TYPE = "string";

const RETURN_DOC_TAG_PATTERN = /^\/\/\/\s*@returns\b/i;
const LEGACY_RETURNS_DESCRIPTION_PATTERN = /^(.+?)\s*-\s*(.*)$/; // simplified pattern for core

const DOC_COMMENT_TAG_PATTERN = /^\/\/\/\s*@/i;
const DOC_COMMENT_ALT_TAG_PATTERN = /^\/\/\s*\/\s*@/i;

function isDocCommentTagLine(line: unknown) {
    if (typeof line !== STRING_TYPE) {
        return false;
    }

    const trimmed = toTrimmedString(line);
    return (
        DOC_COMMENT_TAG_PATTERN.test(trimmed) ||
        DOC_COMMENT_ALT_TAG_PATTERN.test(trimmed)
    );
}

export function parseDocCommentMetadata(
    line: unknown
): DocCommentMetadata | null {
    if (typeof line !== "string") {
        return null;
    }

    const trimmed = line.trim();
    const match = trimmed.match(/^\/\/\/\s*@([a-z]+)\b\s*(.*)$/i);
    if (!match) {
        return null;
    }

    const tag = match[1].toLowerCase();
    const remainder = match[2].trim();

    if (tag === "param") {
        let paramSection = remainder;
        let type = null;

        if (paramSection.startsWith("{")) {
            const typeMatch = paramSection.match(/^\{([^}]*)\}\s*(.*)$/);
            if (typeMatch) {
                type = typeMatch[1]?.trim() ?? null;
                paramSection = typeMatch[2] ?? "";
            }
        }

        let name = null;
        if (paramSection.startsWith("[")) {
            let depth = 0;
            for (let i = 0; i < paramSection.length; i += 1) {
                const char = paramSection[i];
                if (char === "[") {
                    depth += 1;
                } else if (char === "]") {
                    depth -= 1;
                    if (depth === 0) {
                        name = paramSection.slice(0, i + 1);
                        break;
                    }
                }
            }
        }

        if (!name) {
            const paramMatch = paramSection.match(/^(\S+)/);
            name = paramMatch ? paramMatch[1] : null;
        }

        return {
            tag,
            name,
            type: type ?? null
        };
    }

    return { tag, name: remainder };
}

export function dedupeReturnDocLines(
    lines: DocCommentLines | string[],
    {
        includeNonReturnLine
    }: {
        includeNonReturnLine?: (line: string, trimmed: string) => boolean;
    } = {}
) {
    const shouldIncludeNonReturn =
        typeof includeNonReturnLine === "function"
            ? includeNonReturnLine
            : () => true;

    const deduped: string[] = [];
    const seenReturnLines = new Set<string>();
    let removedAnyReturnLine = false;

    for (const line of lines) {
        if (typeof line !== STRING_TYPE) {
            deduped.push(line);
            continue;
        }

        const trimmed = toTrimmedString(line);
        if (!RETURN_DOC_TAG_PATTERN.test(trimmed)) {
            if (shouldIncludeNonReturn(line, trimmed)) {
                deduped.push(line);
            }
            continue;
        }

        if (trimmed.length === 0) {
            continue;
        }

        const key = trimmed.toLowerCase();
        if (seenReturnLines.has(key)) {
            removedAnyReturnLine = true;
            continue;
        }

        seenReturnLines.add(key);
        deduped.push(line);
    }

    return { lines: deduped as DocCommentLines, removed: removedAnyReturnLine };
}

export function reorderDescriptionLinesAfterFunction(
    docLines: DocCommentLines | string[]
): DocCommentLines {
    const normalizedDocLines: string[] = Array.isArray(docLines)
        ? [...docLines]
        : [];

    if (normalizedDocLines.length === 0) {
        return normalizedDocLines as DocCommentLines;
    }

    const descriptionBlocks: number[][] = [];
    let earliestDescriptionIndex = Infinity;
    for (let index = 0; index < normalizedDocLines.length; index += 1) {
        const line = normalizedDocLines[index];
        if (
            typeof line !== STRING_TYPE ||
            !/^\/\/\/\s*@description\b/i.test(line.trim())
        ) {
            continue;
        }

        const blockIndices = [index];
        let lookahead = index + 1;
        while (lookahead < normalizedDocLines.length) {
            const nextLine = normalizedDocLines[lookahead];
            if (
                typeof nextLine === STRING_TYPE &&
                nextLine.startsWith("///") &&
                !parseDocCommentMetadata(nextLine)
            ) {
                blockIndices.push(lookahead);
                lookahead += 1;
                continue;
            }
            break;
        }

        descriptionBlocks.push(blockIndices);
        if (index < earliestDescriptionIndex) {
            earliestDescriptionIndex = index;
        }
        if (lookahead > index + 1) {
            index = lookahead - 1;
        }
    }

    if (descriptionBlocks.length === 0) {
        return normalizedDocLines as DocCommentLines;
    }

    const descriptionStartIndices = descriptionBlocks.map((block) => block[0]);

    const functionIndex = normalizedDocLines.findIndex(
        (line) =>
            typeof line === STRING_TYPE &&
            /^\/\/\/\s*@function\b/i.test(line.trim())
    );

    if (functionIndex === -1) {
        return normalizedDocLines as DocCommentLines;
    }

    const firstReturnsIndex = normalizedDocLines.findIndex(
        (line, i) =>
            i > functionIndex &&
            typeof line === STRING_TYPE &&
            /^\/\/\/\s*@returns\b/i.test(line.trim())
    );
    const allDescriptionsPrecedeReturns = descriptionStartIndices.every(
        (idx) =>
            idx > functionIndex &&
            (firstReturnsIndex === -1 || idx < firstReturnsIndex)
    );

    if (
        earliestDescriptionIndex > functionIndex &&
        allDescriptionsPrecedeReturns
    ) {
        return normalizedDocLines as DocCommentLines;
    }

    const descriptionIndices = descriptionBlocks.flat();
    const descriptionIndexSet = new Set<number>(descriptionIndices);

    const descriptionLines: string[] = [];
    for (const block of descriptionBlocks) {
        for (const blockIndex of block) {
            const docLine = normalizedDocLines[blockIndex];
            if (typeof docLine !== STRING_TYPE) {
                continue;
            }

            if (/^\/\/\/\s*@description\b/i.test(docLine.trim())) {
                const metadata = parseDocCommentMetadata(docLine);
                const descriptionText =
                    typeof metadata?.name === STRING_TYPE
                        ? metadata.name.trim()
                        : "";
                if (!isNonEmptyTrimmedString(descriptionText)) {
                    descriptionLines.push(docLine);
                    continue;
                }

                descriptionLines.push(`/// @description ${descriptionText}`);
                continue;
            }

            descriptionLines.push(docLine);
        }
    }

    const filtered = normalizedDocLines.filter(
        (_line, idx) => !descriptionIndexSet.has(idx)
    );

    // Find insertion position after function
    let insertionIdx = filtered.findIndex(
        (line, i) =>
            i > functionIndex &&
            typeof line === STRING_TYPE &&
            /^\/\/\/\s*@returns\b/i.test(line.trim())
    );
    if (insertionIdx === -1) insertionIdx = filtered.length;

    const result = [
        ...filtered.slice(0, insertionIdx),
        ...descriptionLines,
        ...filtered.slice(insertionIdx)
    ];

    return result as DocCommentLines;
}

export function convertLegacyReturnsDescriptionLinesToMetadata(
    docLines: DocCommentLines | string[],
    opts: { normalizeDocCommentTypeAnnotations?: (line: string) => string } = {}
) {
    const normalizedLines: string[] = Array.isArray(docLines)
        ? [...docLines]
        : [];

    if (normalizedLines.length === 0) {
        return normalizedLines as DocCommentLines;
    }

    const preserveLeadingBlank =
        (normalizedLines as any)._suppressLeadingBlank === true;
    const preserveDescriptionBreaks =
        (normalizedLines as any)._preserveDescriptionBreaks === true;

    const convertedReturns: string[] = [];
    const retainedLines: string[] = [];

    for (const line of normalizedLines) {
        if (typeof line !== STRING_TYPE) {
            retainedLines.push(line);
            continue;
        }

        const match = line.match(/^(\s*\/\/\/)(.*)$/);
        if (!match) {
            retainedLines.push(line);
            continue;
        }

        const [, prefix = "///", suffix = ""] = match;
        const trimmedSuffix = suffix.trim();
        if (trimmedSuffix.length === 0) {
            retainedLines.push(line);
            continue;
        }

        // If the line already contains a doc-tag (e.g. `@param`, `@returns`),
        // treat it as an explicit metadata tag and do not attempt to convert
        // a legacy "payload - description" style into a @returns tag. This
        // prevents lines such as `/// @param {real} r -  The radius` from
        // being misinterpreted as an implicit returns description.
        if (trimmedSuffix.startsWith("@")) {
            retainedLines.push(line);
            continue;
        }

        // Support two common legacy patterns:
        // 1) "payload - description" (hyphen style)
        // 2) "Returns: type, description" (colon-style)
        // Try to recognize the colon-style first to support existing tests
        // whose sources use the "Returns:" prefix for conversion.
        const returnsMatch = trimmedSuffix.match(
            LEGACY_RETURNS_DESCRIPTION_PATTERN
        );
        let payload = "";

        const returnsColonMatch = trimmedSuffix.match(/^returns\s*:\s*(.*)$/i);
        if (returnsColonMatch) {
            payload = (returnsColonMatch[1] ?? "").trim();
        } else if (returnsMatch) {
            payload = returnsMatch[1]?.trim() ?? "";
        } else {
            retainedLines.push(line);
            continue;
        }

        let typeText = "";
        let descriptionText = "";

        const typeAndDescriptionMatch = payload.match(
            /^([^,–—-]+)[,–—-]\s*(.+)$/
        );

        if (typeAndDescriptionMatch) {
            typeText = typeAndDescriptionMatch[1].trim();
            descriptionText = typeAndDescriptionMatch[2].trim();
        } else {
            const candidate = payload.trim();
            if (candidate.length === 0) {
                retainedLines.push(line);
                continue;
            }

            if (/\s/.test(candidate)) {
                descriptionText = candidate;
            } else {
                typeText = candidate.replace(/[,.]+$/u, "").trim();
            }
        }

        if (typeText.length === 0 && descriptionText.length === 0) {
            retainedLines.push(line);
            continue;
        }

        if (descriptionText.length > 0 && /^[a-z]/.test(descriptionText)) {
            descriptionText = capitalize(descriptionText);
        }

        let normalizedType = typeText.trim();
        if (normalizedType.length > 0 && !/^\{.*\}$/.test(normalizedType)) {
            normalizedType = `{${normalizedType}}`;
        }

        let converted = `${prefix} @returns`;
        if (normalizedType.length > 0) {
            converted += ` ${normalizedType}`;
        }
        if (descriptionText.length > 0) {
            converted += ` ${descriptionText}`;
        }

        const typeNormalizer = opts.normalizeDocCommentTypeAnnotations;
        if (typeof typeNormalizer === "function") {
            converted = typeNormalizer(converted);
        }

        converted = converted.replaceAll(/\{boolean\}/gi, "{bool}");
        convertedReturns.push(converted);
    }

    if (convertedReturns.length === 0) {
        if (preserveLeadingBlank) {
            (normalizedLines as any)._suppressLeadingBlank = true;
        }
        if (preserveDescriptionBreaks) {
            (normalizedLines as any)._preserveDescriptionBreaks = true;
        }
        return normalizedLines as DocCommentLines;
    }

    const resultLines = [...retainedLines];

    let appendIndex = resultLines.length;
    while (
        appendIndex > 0 &&
        typeof resultLines[appendIndex - 1] === STRING_TYPE &&
        resultLines[appendIndex - 1].trim() === ""
    ) {
        appendIndex -= 1;
    }

    resultLines.splice(appendIndex, 0, ...convertedReturns);

    if (preserveLeadingBlank) {
        (resultLines as any)._suppressLeadingBlank = true;
    }

    if (preserveDescriptionBreaks) {
        (resultLines as any)._preserveDescriptionBreaks = true;
    }

    return resultLines as DocCommentLines;
}

export function promoteLeadingDocCommentTextToDescription(
    docLines: DocCommentLines | string[],
    extraTaggedDocLines: DocCommentLines | string[] = []
) {
    const normalizedLines = Array.isArray(docLines) ? [...docLines] : [];

    if (normalizedLines.length === 0) {
        return normalizedLines as DocCommentLines;
    }

    const segments: { prefix: string; suffix: string }[] = [];
    let leadingCount = 0;

    while (leadingCount < normalizedLines.length) {
        const line = normalizedLines[leadingCount];
        if (typeof line !== STRING_TYPE) {
            break;
        }

        const trimmed = line.trim();
        const isDocLikeSummary =
            trimmed.startsWith("///") || /^\/\/\s*\//.test(trimmed);
        if (!isDocLikeSummary) {
            break;
        }

        const isTaggedLine =
            /^\/\/\/\s*@/i.test(trimmed) || /^\/\/\s*\/\s*@/i.test(trimmed);
        if (isTaggedLine) {
            break;
        }

        let match = line.match(/^(\s*\/\/\/)(.*)$/);
        if (!match) {
            const docLikeMatch = line.match(/^(\s*)\/\/\s*\/(.*)$/);
            if (!docLikeMatch) {
                break;
            }

            const [, indent = "", suffix = ""] = docLikeMatch;
            match = [line, `${indent}///`, suffix];
        }

        const [, prefix = "///", suffix = ""] = match;
        segments.push({ prefix, suffix });
        leadingCount += 1;
    }

    if (segments.length === 0) {
        return normalizedLines as DocCommentLines;
    }

    const firstContentIndex = segments.findIndex(({ suffix }) =>
        isNonEmptyTrimmedString(suffix)
    );

    if (firstContentIndex === -1) {
        return normalizedLines as DocCommentLines;
    }

    const remainder = normalizedLines.slice(leadingCount);
    const remainderContainsTag = remainder.some(isDocCommentTagLine);
    const extraContainsTag =
        Array.isArray(extraTaggedDocLines) &&
        extraTaggedDocLines.some(isDocCommentTagLine);

    if (!remainderContainsTag && !extraContainsTag) {
        return normalizedLines as DocCommentLines;
    }

    const promotedLines: string[] = [];
    const firstSegment = segments[firstContentIndex];
    const indent = firstSegment.prefix.slice(
        0,
        Math.max(firstSegment.prefix.length - 3, 0)
    );
    const normalizedBasePrefix = `${indent}///`;
    const descriptionLinePrefix = `${normalizedBasePrefix} @description `;
    const continuationPadding = Math.max(
        descriptionLinePrefix.length - (indent.length + 4),
        0
    );
    const continuationPrefix = `${indent}/// ${" ".repeat(continuationPadding)}`;

    for (const [index, { prefix, suffix }] of segments.entries()) {
        const trimmedSuffix = suffix.trim();
        const hasLeadingWhitespace = suffix.length === 0 || /^\s/.test(suffix);

        if (index < firstContentIndex) {
            const normalizedSuffix = hasLeadingWhitespace
                ? suffix
                : ` ${suffix}`;
            promotedLines.push(`${prefix}${normalizedSuffix}`);
            continue;
        }

        if (index === firstContentIndex) {
            promotedLines.push(
                trimmedSuffix.length > 0
                    ? `${prefix} @description ${trimmedSuffix}`
                    : `${prefix} @description`
            );
            continue;
        }

        if (trimmedSuffix.length === 0) {
            continue;
        }

        const continuationText = trimmedSuffix;
        const resolvedContinuation =
            continuationPrefix.length > 0
                ? `${continuationPrefix}${continuationText}`
                : `${prefix} ${continuationText}`;

        promotedLines.push(resolvedContinuation);
    }

    // we already computed remainder above
    const result: DocCommentLines = [
        ...promotedLines,
        ...remainder
    ] as DocCommentLines;

    const hasContinuationSegments = segments.some(
        ({ suffix }, index) =>
            index > firstContentIndex && isNonEmptyTrimmedString(suffix)
    );

    if (hasContinuationSegments) {
        (result as any)._preserveDescriptionBreaks = true;
    }

    if ((normalizedLines as any)._suppressLeadingBlank) {
        (result as any)._suppressLeadingBlank = true;
    }

    return result;
}

/**
 * Detect whether doc lines include legacy `returns - description` style entries
 * that should be converted to `@returns {Type} Description` metadata.
 */
export function hasLegacyReturnsDescriptionLines(
    docLines: DocCommentLines | string[]
) {
    const normalizedLines: string[] = Array.isArray(docLines)
        ? [...docLines]
        : [];
    if (normalizedLines.length === 0) {
        return false;
    }

    for (const line of normalizedLines) {
        if (typeof line !== STRING_TYPE) continue;
        const match = line.match(/^(\s*\/\/\/)(.*)$/);
        if (!match) continue;
        const suffix = (match[2] ?? "").trim();
        if (suffix.length === 0) continue;
        if (LEGACY_RETURNS_DESCRIPTION_PATTERN.test(suffix)) return true;
    }

    return false;
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
        regex: new RegExp(String.raw`(\/\/\/\s*)${oldWord}\b`, "gi"),
        replacement: newWord
    })
);

const FUNCTION_LIKE_DOC_TAG_PATTERN = /@(func(?:tion)?|method)\b/i;

const FUNCTION_SIGNATURE_PATTERN =
    /(^|\n)(\s*\/\/\/\s*@function\b[^\r\n]*?)(\s*\([^\)]*\))(\s*(?=\n|$))/gi;

const DOC_COMMENT_TYPE_PATTERN = /\{([^}]+)\}/g;

export const DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION = Object.freeze({
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
        ["constant", "Constant"],
        ["enum", "Enum"],
        ["id", "Id"],
        ["struct", "Struct"]
    ])
});

const docCommentTypeNormalizationController = createResolverController({
    defaultFactory: () =>
        createDocCommentTypeNormalization(
            DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION
        ),
    reuseDefaultValue: true,
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

function normalizeEntryPair(entry: unknown) {
    if (Array.isArray(entry)) {
        return entry.length >= 2 ? [entry[0], entry[1]] : null;
    }

    if (!entry || typeof entry !== "object") {
        return null;
    }

    if (Object.hasOwn(entry, 0) && Object.hasOwn(entry, 1)) {
        const arr = entry as any;
        return [arr[0], arr[1]];
    }

    if (Object.hasOwn(entry, "key") && Object.hasOwn(entry, "value")) {
        const obj = entry as Record<string, unknown>;
        return [obj.key, obj.value];
    }

    return null;
}

function normalizeDocCommentLookupKey(identifier: unknown) {
    const trimmed = getNonEmptyTrimmedString(identifier);
    if (!trimmed) {
        return null;
    }

    const normalized = trimmed.toLowerCase();
    if (normalized.length === 0) {
        return null;
    }

    return normalized;
}

function createDocCommentTypeNormalization(candidate: unknown) {
    const synonyms = new Map<string, string>();
    for (const [
        key,
        value
    ] of DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.synonyms) {
        synonyms.set(key.toLowerCase(), value);
    }

    const canonicalSpecifierNames = new Map<string, string>();
    for (const [
        key,
        value
    ] of DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.canonicalSpecifierNames) {
        canonicalSpecifierNames.set(key.toLowerCase(), value);
    }

    const specifierPrefixes = new Set(
        DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.specifierPrefixes.map((value) =>
            value.toLowerCase()
        )
    );

    if (candidate && typeof candidate === "object") {
        const cand = candidate as Record<string, unknown>;
        mergeNormalizationEntries(synonyms, cand.synonyms);
        mergeNormalizationEntries(
            canonicalSpecifierNames,
            cand.canonicalSpecifierNames
        );
        mergeSpecifierPrefixes(specifierPrefixes, cand.specifierPrefixes);
    }

    return Object.freeze({
        lookupTypeIdentifier(identifier: unknown) {
            return withNormalizedDocCommentLookup(
                identifier,
                (normalized) => synonyms.get(normalized) ?? null,
                null
            );
        },
        getCanonicalSpecifierName(identifier: unknown) {
            return withNormalizedDocCommentLookup(
                identifier,
                (normalized) => canonicalSpecifierNames.get(normalized) ?? null,
                null
            );
        },
        hasSpecifierPrefix(identifier: unknown) {
            return withNormalizedDocCommentLookup(
                identifier,
                (normalized) => specifierPrefixes.has(normalized),
                false
            );
        }
    });
}

function withNormalizedDocCommentLookup(
    identifier: unknown,
    handler: (normalized: string) => unknown,
    fallbackValue: unknown
) {
    if (typeof handler !== "function") {
        throw new TypeError(
            "Doc comment lookup handler must be provided as a function."
        );
    }

    const normalized = normalizeDocCommentLookupKey(identifier);
    if (!normalized) {
        return fallbackValue;
    }

    return handler(normalized);
}

function mergeNormalizationEntries(
    target: Map<string, string>,
    entries: unknown
) {
    if (!entries) {
        return;
    }

    for (const [rawKey, rawValue] of getEntryIterable(entries) ?? []) {
        const key = normalizeDocCommentLookupKey(rawKey);
        const value = getNonEmptyTrimmedString(rawValue);
        if (!key || !value) {
            continue;
        }
        target.set(key, value);
    }
}

function mergeSpecifierPrefixes(target: Set<string>, candidates: unknown) {
    if (!candidates) {
        return;
    }

    for (const candidate of toIterable(candidates)) {
        const normalized = normalizeDocCommentLookupKey(candidate);
        if (!normalized) {
            continue;
        }
        target.add(normalized);
    }
}

function tryGetEntriesIterator(candidate: unknown) {
    if (
        !candidate ||
        Array.isArray(candidate) ||
        (typeof candidate !== "object" && typeof candidate !== "function")
    ) {
        return null;
    }

    const { entries } = candidate as { entries?: () => Iterator<unknown> };
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

function* getEntryIterable(value: unknown) {
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

function* toIterable(value: unknown) {
    if (value === undefined || value === null) {
        return;
    }

    if (typeof value === "string") {
        yield value;
        return;
    }

    if (typeof value[Symbol.iterator] === "function") {
        yield* value as Iterable<unknown>;
        return;
    }

    if (typeof value === "object") {
        yield* Object.values(value as Record<string, unknown>);
    }
}

export function resolveDocCommentTypeNormalization(options: unknown = {}) {
    return docCommentTypeNormalizationController.resolve(options);
}

export function setDocCommentTypeNormalizationResolver(resolver: unknown) {
    return docCommentTypeNormalizationController.set(resolver);
}

export function restoreDefaultDocCommentTypeNormalizationResolver() {
    return docCommentTypeNormalizationController.restore();
}

export function applyJsDocReplacements(text: unknown) {
    const shouldStripEmptyParams =
        typeof text === "string" && FUNCTION_LIKE_DOC_TAG_PATTERN.test(text);

    let formattedText: unknown = text;

    if (typeof text === "string") {
        let stringText: string = shouldStripEmptyParams
            ? text.replace(/\(\)\s*$/, "")
            : text;

        for (const { regex, replacement } of JSDOC_REPLACEMENT_RULES) {
            regex.lastIndex = 0;
            stringText = stringText.replace(regex, `$1${replacement}`);
        }

        stringText = stripTrailingFunctionParameters(stringText);
        stringText = normalizeFeatherOptionalParamSyntax(stringText);

        formattedText = stringText;
    }

    if (typeof formattedText !== "string") {
        return formattedText;
    }

    return normalizeDocCommentTypeAnnotations(formattedText);
}

function normalizeFeatherOptionalParamSyntax(text: string) {
    if (typeof text !== "string" || !/@param\b/i.test(text)) {
        return text;
    }

    return text.replace(
        /(\s*\/\/\/\s*@param(?:\s+\{[^}]+\})?\s*)(\S+)/i,
        (match, prefix, token) =>
            `${prefix}${normalizeOptionalParamToken(token)}`
    );
}

function stripTrailingFunctionParameters(text: string) {
    if (typeof text !== "string" || !/@function\b/i.test(text)) {
        return text;
    }

    return text.replaceAll(
        FUNCTION_SIGNATURE_PATTERN,
        (match, linePrefix, functionPrefix) =>
            `${linePrefix}${functionPrefix.replace(/\s+$/, "")}`
    );
}

export function normalizeDocCommentTypeAnnotations(text: string) {
    if (typeof text !== "string" || !text.includes("{")) {
        return text;
    }

    DOC_COMMENT_TYPE_PATTERN.lastIndex = 0;
    return text.replace(DOC_COMMENT_TYPE_PATTERN, (match, typeText) => {
        const normalized = normalizeGameMakerType(typeText);
        return `{${normalized}}`;
    });
}

function normalizeGameMakerType(typeText: string) {
    if (typeof typeText !== "string") {
        return typeText;
    }

    const docCommentTypeNormalization = resolveDocCommentTypeNormalization();
    const segments: Array<{ type: "identifier" | "separator"; value: string }> =
        [];
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

    const findNextNonWhitespaceSegment = (startIndex: number) => {
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

    const outputSegments: string[] = [];

    const isDotSeparatedTypeSpecifierPrefix = (prefixIndex: number) => {
        let sawDot = false;

        for (let index = prefixIndex + 1; index < segments.length; index += 1) {
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
            let normalizedValue: unknown = segment.value;

            if (typeof normalizedValue === "string") {
                const canonicalPrefix =
                    docCommentTypeNormalization.getCanonicalSpecifierName(
                        normalizedValue
                    ) as string | null;

                if (
                    typeof canonicalPrefix === "string" &&
                    isDotSeparatedTypeSpecifierPrefix(index)
                ) {
                    normalizedValue = canonicalPrefix;
                }
            }

            outputSegments.push(normalizedValue as string);
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
                docCommentTypeNormalization.hasSpecifierPrefix(
                    previousIdentifier
                )
            ) {
                const canonicalPrefix =
                    docCommentTypeNormalization.getCanonicalSpecifierName(
                        previousIdentifier
                    );
                if (canonicalPrefix && outputSegments.length > 0) {
                    outputSegments[outputSegments.length - 1] =
                        canonicalPrefix as string;
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
