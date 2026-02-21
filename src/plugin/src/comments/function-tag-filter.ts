import type { MutableDocCommentLines } from "@gml-modules/core";

const FUNCTION_TAG_PATTERN = /^\s*\/+\s*@(?:function|func)\b/i;

type DocCommentLineMetadata = {
    _preserveDescriptionBreaks?: boolean;
    _suppressLeadingBlank?: boolean;
    _blockCommentDocs?: boolean;
};

export function isFunctionDocCommentLine(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 && FUNCTION_TAG_PATTERN.test(trimmed);
}

export function removeFunctionDocCommentLines(lines: readonly unknown[]): MutableDocCommentLines {
    const filtered: MutableDocCommentLines = [];

    for (const line of lines) {
        if (isFunctionDocCommentLine(line)) {
            continue;
        }

        if (typeof line === "string") {
            filtered.push(line);
        }
    }

    // Propagate metadata properties from the original array to the filtered one.
    // This ensures that flags like _preserveDescriptionBreaks or _blockCommentDocs
    // are not lost during the filtering process.
    const original = lines as DocCommentLineMetadata;
    const target = filtered as MutableDocCommentLines & DocCommentLineMetadata;
    if (original._preserveDescriptionBreaks === true) {
        target._preserveDescriptionBreaks = true;
    }
    if (original._suppressLeadingBlank === true) {
        target._suppressLeadingBlank = true;
    }
    if (original._blockCommentDocs === true) {
        target._blockCommentDocs = true;
    }

    return filtered;
}

/**
 * Returns printer-specific doc-comment options resolved from the given options object.
 * The result is informational only and not consumed by the current implementation.
 * TODO: implement proper option resolution when printer-specific doc-comment behavior is needed.
 */
export function resolveDocCommentPrinterOptions(options: unknown): unknown {
    return options;
}
