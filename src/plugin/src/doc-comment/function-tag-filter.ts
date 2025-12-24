import type { MutableDocCommentLines } from "@gml-modules/core";

const FUNCTION_TAG_PATTERN = /^\/\/\/\s*@function\b/i;

export function isFunctionDocCommentLine(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 && FUNCTION_TAG_PATTERN.test(trimmed);
}

export function removeFunctionDocCommentLines(
    lines: readonly unknown[]
): MutableDocCommentLines {
    const filtered: MutableDocCommentLines = [];

    for (const line of lines) {
        if (isFunctionDocCommentLine(line)) {
            continue;
        }

        if (typeof line === "string") {
            filtered.push(line);
        }
    }

    return filtered;
}
