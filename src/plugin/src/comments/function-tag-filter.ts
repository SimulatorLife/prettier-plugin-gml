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
 * Resolves doc-comment printer options from the plugin options object.
 * Returns a normalized options record for use during doc-comment printing.
 */
export function resolveDocCommentPrinterOptions(options: unknown): Record<string, unknown> {
    if (options !== null && typeof options === "object") {
        return options as Record<string, unknown>;
    }

    return {};
}
