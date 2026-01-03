import { toTrimmedString } from "../../../utils/string.js";

const STRING_TYPE = "string";
const NUMBER_TYPE = "number";

const DOC_COMMENT_TAG_PATTERN = /^\/\/\/\s*@/i;
const DOC_COMMENT_ALT_TAG_PATTERN = /^\/\/\s*\/\s*@/i;

export type DocCommentMetadata = {
    tag: string;
    name?: string | null;
    type?: string | null;
    description?: string | null;
};

export function isDocCommentTagLine(line: unknown) {
    if (typeof line !== STRING_TYPE) {
        return false;
    }

    const trimmed = toTrimmedString(line);
    return DOC_COMMENT_TAG_PATTERN.test(trimmed) || DOC_COMMENT_ALT_TAG_PATTERN.test(trimmed);
}

export function parseDocCommentMetadata(line: unknown): DocCommentMetadata | null {
    if (typeof line !== STRING_TYPE) {
        return null;
    }

    const trimmed = (line as string).trim();
    const match = trimmed.match(/^\/\/\/\s*@([a-z]+)\b\s*(.*)$/i);
    if (!match) {
        return null;
    }

    const tag = match[1].toLowerCase();
    const remainder = match[2].trim();

    if (tag === "param" || tag === "arg" || tag === "argument") {
        let paramSection = remainder;
        let type = null;

        if (paramSection.startsWith("{")) {
            const typeMatch = paramSection.match(/^\{([^}]*)\}\s*(.*)$/);
            if (typeMatch) {
                type = typeMatch[1]?.trim() ?? null;
                paramSection = typeMatch[2] ?? "";
            }
        } else if (paramSection.startsWith("<")) {
            const typeMatch = paramSection.match(/^<([^>]*)>\s*(.*)$/);
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

        let description = null;
        if (name) {
            const nameLength = name.length;
            let rawDescription = paramSection.slice(nameLength).trim();
            if (rawDescription.startsWith("-")) {
                rawDescription = rawDescription.slice(1).trim();
            }
            if (rawDescription.length > 0) {
                description = rawDescription;
            }
        }

        return {
            tag,
            name,
            type,
            description
        };
    }

    return { tag, name: remainder };
}

function isInlineWhitespace(charCode: number) {
    return (
        charCode === 9 || // Tab
        charCode === 10 || // Line feed
        charCode === 13 || // Carriage return
        charCode === 32 // Space
    );
}

export function isDocLikeLeadingLine(value: unknown) {
    if (typeof value !== STRING_TYPE) {
        return false;
    }

    const trimmed = (value as string).trim();
    return trimmed.startsWith("///") || /^\/\/\s*\/\s*/.test(trimmed) || /^\/+\s*@/.test(trimmed);
}

export function hasCommentImmediatelyBefore(text: unknown, index: unknown) {
    if (typeof text !== STRING_TYPE || typeof index !== NUMBER_TYPE) {
        return false;
    }

    const normalizedText = text as string;
    const normalizedIndex = index as number;

    let cursor = normalizedIndex - 1;
    while (cursor >= 0 && isInlineWhitespace(normalizedText.charCodeAt(cursor))) {
        cursor -= 1;
    }

    if (cursor < 0) {
        return false;
    }

    const lineEndExclusive = cursor + 1;
    while (cursor >= 0) {
        const charCode = normalizedText.charCodeAt(cursor);
        if (charCode === 10 || charCode === 13) {
            break;
        }
        cursor -= 1;
    }

    let lineStart = cursor + 1;
    while (lineStart < lineEndExclusive && isInlineWhitespace(normalizedText.charCodeAt(lineStart))) {
        lineStart += 1;
    }

    if (lineStart >= lineEndExclusive) {
        return false;
    }

    let lineEnd = lineEndExclusive - 1;
    while (lineEnd >= lineStart && isInlineWhitespace(normalizedText.charCodeAt(lineEnd))) {
        lineEnd -= 1;
    }

    if (lineEnd < lineStart) {
        return false;
    }

    const first = normalizedText.charCodeAt(lineStart);
    const second = lineStart + 1 <= lineEnd ? normalizedText.charCodeAt(lineStart + 1) : -1;

    if (first === 47) {
        if (second === 47 || second === 42) {
            return true;
        }
    } else if (first === 42) {
        return true;
    }

    return (
        lineEnd >= lineStart + 1 &&
        normalizedText.charCodeAt(lineEnd) === 47 &&
        normalizedText.charCodeAt(lineEnd - 1) === 42
    );
}
