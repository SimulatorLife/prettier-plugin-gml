import { capitalize, isNonEmptyTrimmedString, toTrimmedString } from "../../../utils/string.js";
import type { DocCommentLines } from "../../comment-utils.js";
import { parseDocCommentMetadata, isDocCommentTagLine } from "./metadata.js";

const STRING_TYPE = "string";

const RETURN_DOC_TAG_PATTERN = /^\/\/\/\s*@returns\b/i;
const LEGACY_RETURNS_DESCRIPTION_PATTERN = /^(.+?)\s+-\s+(.*)$/;

const KNOWN_TYPE_IDENTIFIERS = Object.freeze([
    "real",
    "string",
    "bool",
    "boolean",
    "void",
    "undefined",
    "pointer",
    "array",
    "struct",
    "id",
    "asset",
    "any",
    "function",
    "constant"
]);

const KNOWN_TYPES = new Set(KNOWN_TYPE_IDENTIFIERS.map((identifier) => identifier.toLowerCase()));

export function dedupeReturnDocLines(
    lines: DocCommentLines | string[],
    {
        includeNonReturnLine
    }: {
        includeNonReturnLine?: (line: string, trimmed: string) => boolean;
    } = {}
) {
    const shouldIncludeNonReturn = typeof includeNonReturnLine === "function" ? includeNonReturnLine : () => true;

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

    const resultLines = deduped as any;
    if ((lines as any)._preserveDescriptionBreaks === true) {
        resultLines._preserveDescriptionBreaks = true;
    }
    if ((lines as any)._suppressLeadingBlank === true) {
        resultLines._suppressLeadingBlank = true;
    }
    if ((lines as any)._blockCommentDocs === true) {
        resultLines._blockCommentDocs = true;
    }

    return { lines: resultLines as DocCommentLines, removed: removedAnyReturnLine };
}

export function reorderDescriptionLinesToTop(docLines: DocCommentLines | string[]): DocCommentLines {
    const normalizedDocLines: string[] = Array.isArray(docLines) ? [...docLines] : [];

    if (normalizedDocLines.length === 0) {
        return normalizedDocLines as DocCommentLines;
    }

    const descriptionBlocks: number[][] = [];
    for (let index = 0; index < normalizedDocLines.length; index += 1) {
        const line = normalizedDocLines[index];
        if (typeof line !== STRING_TYPE || !/^\/\/\/\s*@description\b/i.test(line.trim())) {
            continue;
        }

        const blockIndices = [index];
        let lookahead = index + 1;
        while (lookahead < normalizedDocLines.length) {
            const nextLine = normalizedDocLines[lookahead];
            if (typeof nextLine === STRING_TYPE && nextLine.startsWith("///") && !parseDocCommentMetadata(nextLine)) {
                blockIndices.push(lookahead);
                lookahead += 1;
                continue;
            }
            break;
        }

        descriptionBlocks.push(blockIndices);
        if (lookahead > index + 1) {
            index = lookahead - 1;
        }
    }

    if (descriptionBlocks.length === 0) {
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
                const descriptionText = typeof metadata?.name === STRING_TYPE ? metadata.name.trim() : "";
                if (!isNonEmptyTrimmedString(descriptionText)) {
                    continue;
                }

                descriptionLines.push(`/// @description ${descriptionText}`);
                continue;
            }

            descriptionLines.push(docLine);
        }
    }

    const filtered = normalizedDocLines.filter((_line, idx) => !descriptionIndexSet.has(idx));

    const result = [...descriptionLines, ...filtered] as any;
    if ((docLines as any)._preserveDescriptionBreaks === true) {
        result._preserveDescriptionBreaks = true;
    }
    if ((docLines as any)._suppressLeadingBlank === true) {
        result._suppressLeadingBlank = true;
    }
    if ((docLines as any)._blockCommentDocs === true) {
        result._blockCommentDocs = true;
    }

    return result as DocCommentLines;
}

export function convertLegacyReturnsDescriptionLinesToMetadata(
    docLines: DocCommentLines | string[],
    opts: { normalizeDocCommentTypeAnnotations?: (line: string) => string } = {}
) {
    const normalizedLines: string[] = Array.isArray(docLines) ? [...docLines] : [];

    if (normalizedLines.length === 0) {
        return normalizedLines as DocCommentLines;
    }

    const preserveLeadingBlank = (docLines as any)._suppressLeadingBlank === true;
    const preserveDescriptionBreaks = (docLines as any)._preserveDescriptionBreaks === true;

    const convertedReturns: string[] = [];
    const retainedLines: string[] = [];
    const normalizedTypeAnnotation =
        typeof opts.normalizeDocCommentTypeAnnotations === "function"
            ? opts.normalizeDocCommentTypeAnnotations
            : undefined;

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

        if (trimmedSuffix.startsWith("@")) {
            retainedLines.push(line);
            continue;
        }

        const returnsMatch = trimmedSuffix.match(LEGACY_RETURNS_DESCRIPTION_PATTERN);
        let payload: string;

        const returnsColonMatch = trimmedSuffix.match(/^returns\s*:\s*(.*)$/i);

        if (returnsColonMatch) {
            payload = (returnsColonMatch[1] ?? "").trim();
        } else if (returnsMatch) {
            payload = returnsMatch[0];
        } else {
            retainedLines.push(line);
            continue;
        }

        const payloadParts = parseLegacyReturnPayload(payload);
        if (!payloadParts) {
            retainedLines.push(line);
            continue;
        }

        let { typeText, descriptionText } = payloadParts;

        if (descriptionText.length > 0 && /^[a-z]/.test(descriptionText)) {
            descriptionText = capitalize(descriptionText);
        }

        let normalizedType = typeText.trim();
        if (normalizedType.length > 0 && !/^\{.*\}$/.test(normalizedType)) {
            normalizedType = `{${normalizedType}}`;
        }

        if (normalizedTypeAnnotation && normalizedType.length > 0) {
            normalizedType = normalizedTypeAnnotation(normalizedType);
        }

        let converted = `${prefix} @returns`;
        if (normalizedType.length > 0) {
            converted += ` ${normalizedType}`;
        }
        if (descriptionText.length > 0) {
            converted += ` ${descriptionText}`;
        }

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

    const resultLines =
        convertedReturns.length > 0
            ? retainedLines.filter(
                  (line) => !isLegacyFunctionTagWithoutParams(typeof line === STRING_TYPE ? line : null)
              )
            : [...retainedLines];

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

function isLegacyFunctionTagWithoutParams(line: string | null) {
    if (typeof line !== STRING_TYPE) {
        return false;
    }

    if (!/^\s*\/\/\/\s*@function\b/i.test(line)) {
        return false;
    }

    return !/\(/.test(line);
}

function parseLegacyReturnPayload(payload: string) {
    const trimmedPayload = payload.trim();
    if (trimmedPayload.length === 0) {
        return null;
    }

    const typeAndDescriptionMatch = trimmedPayload.match(/^([^,–—-]+)[,–—-]\s*(.+)$/);

    if (typeAndDescriptionMatch) {
        return {
            typeText: typeAndDescriptionMatch[1].trim(),
            descriptionText: typeAndDescriptionMatch[2].trim()
        };
    }

    const spaceMatch = trimmedPayload.match(/^(\S+)\s+(.+)$/);
    if (spaceMatch && KNOWN_TYPES.has(spaceMatch[1].toLowerCase())) {
        return {
            typeText: spaceMatch[1],
            descriptionText: spaceMatch[2]
        };
    }

    if (/\s/.test(trimmedPayload)) {
        return {
            typeText: "",
            descriptionText: trimmedPayload
        };
    }

    return {
        typeText: trimmedPayload.replace(/[,.]+$/u, "").trim(),
        descriptionText: ""
    };
}

const DOC_LIKE_CONTINUATION_PREFIX = /^\s*\/\s+/;

export function promoteLeadingDocCommentTextToDescription(
    docLines: DocCommentLines | string[],
    extraTaggedDocLines: DocCommentLines | string[] = [],
    forcePromotion = false
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
        const isDocLikeSummary = trimmed.startsWith("///") || /^\/\/\s*\//.test(trimmed);
        if (!isDocLikeSummary) {
            break;
        }

        const isTaggedLine = /^\/\/\/\s*@/i.test(trimmed) || /^\/\/\s*\/\s*@/i.test(trimmed);
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
        const trimmedSuffix = suffix.replace(DOC_LIKE_CONTINUATION_PREFIX, "");
        segments.push({ prefix, suffix: trimmedSuffix });
        leadingCount += 1;
    }

    if (segments.length === 0) {
        return normalizedLines as DocCommentLines;
    }

    const firstContentIndex = segments.findIndex(({ suffix }) => isNonEmptyTrimmedString(suffix));

    if (firstContentIndex === -1) {
        return normalizedLines as DocCommentLines;
    }

    const remainder = normalizedLines.slice(leadingCount);
    const remainderContainsTag = remainder.some(isDocCommentTagLine);
    const extraContainsTag = Array.isArray(extraTaggedDocLines) && extraTaggedDocLines.some(isDocCommentTagLine);

    if (!remainderContainsTag && !extraContainsTag && !forcePromotion) {
        return normalizedLines as DocCommentLines;
    }

    const promotedLines: string[] = [];
    const firstSegment = segments[firstContentIndex];
    const indent = firstSegment.prefix.slice(0, Math.max(firstSegment.prefix.length - 3, 0));
    const normalizedBasePrefix = `${indent}///`;
    const descriptionLinePrefix = `${normalizedBasePrefix} @description `;
    const continuationPadding = Math.max(descriptionLinePrefix.length - (indent.length + 4), 0);
    const continuationPrefix = `${indent}/// ${" ".repeat(continuationPadding)}`;

    for (const [index, { prefix, suffix }] of segments.entries()) {
        const trimmedSuffix = suffix.trim();
        const hasLeadingWhitespace = suffix.length === 0 || /^\s/.test(suffix);

        if (index < firstContentIndex) {
            const normalizedSuffix = hasLeadingWhitespace ? suffix : ` ${suffix}`;
            promotedLines.push(`${prefix}${normalizedSuffix}`);
            continue;
        }

        if (index === firstContentIndex) {
            promotedLines.push(
                trimmedSuffix.length > 0 ? `${prefix} @description ${trimmedSuffix}` : `${prefix} @description`
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

    const result: DocCommentLines = [...promotedLines, ...remainder] as DocCommentLines;

    const hasContinuationSegments = segments.some(
        ({ suffix }, index) => index > firstContentIndex && isNonEmptyTrimmedString(suffix)
    );

    if (hasContinuationSegments) {
        (result as any)._preserveDescriptionBreaks = true;
    }

    if ((normalizedLines as any)._suppressLeadingBlank) {
        (result as any)._suppressLeadingBlank = true;
    }

    return result;
}

export function hasLegacyReturnsDescriptionLines(docLines: DocCommentLines | string[]) {
    const normalizedLines: string[] = Array.isArray(docLines) ? [...docLines] : [];
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
        if (/^returns\s*:/i.test(suffix)) return true;
    }

    return false;
}
