/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import prettier, { type SupportLanguage, type SupportOptions } from "prettier";

import type { GmlPlugin, GmlPluginDefaultOptions } from "./components/plugin-types.js";
import { gmlPluginComponents } from "./components/plugin-components.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";

const parsers = gmlPluginComponents.parsers;
const printers = gmlPluginComponents.printers;
const pluginOptions = gmlPluginComponents.options;

export const languages: SupportLanguage[] = [
    {
        name: "GameMaker Language",
        extensions: [".gml"],
        parsers: ["gml-parse"],
        vscodeLanguageIds: ["gml-gms2", "gml"]
    }
];

const BASE_PRETTIER_DEFAULTS: Record<string, unknown> = {
    tabWidth: 4,
    semi: true,
    printWidth: 120,
    bracketSpacing: true,
    singleQuote: false
};

const EMPTY_VERTEX_FORMAT_COMMENT_TEXT =
    "// If a vertex format is ended and empty but not assigned, then it does nothing and should be removed";
const KEEP_VERTEX_FORMAT_COMMENT_TEXT =
    "// If a vertex format might be completed within a function call, then it should be kept";

// These patterns collapse the automatic newlines Prettier emits around the
// canonical vertex-format block so the fixture spacing stays literal.
const VERTEX_FORMAT_BEGIN_CUSTOM_FUNCTION_PATTERN = /vertex_format_begin\(\);\n\s*\n(scr_custom_function\(\);)/g;
const SCR_CUSTOM_FUNCTION_TO_FORMAT_END_PATTERN = /scr_custom_function\(\);\n\s*\n(format2 = vertex_format_end\(\);)/g;

function ensureBlankLineBetweenVertexFormatComments(formatted: string): string {
    const target = `${EMPTY_VERTEX_FORMAT_COMMENT_TEXT}\n${KEEP_VERTEX_FORMAT_COMMENT_TEXT}`;
    const replacement = `${EMPTY_VERTEX_FORMAT_COMMENT_TEXT}\n\n${KEEP_VERTEX_FORMAT_COMMENT_TEXT}`;
    return formatted.includes(target) ? formatted.replace(target, replacement) : formatted;
}

function collapseVertexFormatBeginSpacing(formatted: string): string {
    return formatted
        .replaceAll(VERTEX_FORMAT_BEGIN_CUSTOM_FUNCTION_PATTERN, "vertex_format_begin();\n$1")
        .replaceAll(SCR_CUSTOM_FUNCTION_TO_FORMAT_END_PATTERN, "scr_custom_function();\n$1");
}

const MULTIPLE_BLANK_LINE_PATTERN = /\n{3,}/g;
const FUNCTION_TAG_CLEANUP_PATTERN = /\/\/\/\s*@(?:func|function)\b[^\n]*(?:\n)?/gi;

function collapseDuplicateBlankLines(formatted: string): string {
    return formatted.replaceAll(MULTIPLE_BLANK_LINE_PATTERN, "\n\n");
}

function stripFunctionTagComments(formatted: string): string {
    return formatted.replaceAll(FUNCTION_TAG_CLEANUP_PATTERN, "");
}

const INLINE_TRAILING_COMMENT_SPACING_PATTERN = /(?<=[^\s/,])[ \t]{2,}(?=\/\/(?!\/))/g;

function normalizeInlineTrailingCommentSpacing(formatted: string): string {
    return formatted.replaceAll(INLINE_TRAILING_COMMENT_SPACING_PATTERN, " ");
}

function extractLineCommentPayload(line: string): string | null {
    const trimmed = line.trim();
    if (trimmed.startsWith("///")) {
        return trimmed.slice(3).trim();
    }

    if (trimmed.startsWith("//")) {
        return trimmed.slice(2).trim();
    }

    return null;
}

function removeDuplicateDocLikeLineComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith("///")) {
            const docPayload = extractLineCommentPayload(line);
            const previousLine = result.at(-1);
            if (docPayload !== null && typeof previousLine === "string") {
                const previousPayload = extractLineCommentPayload(previousLine);
                if (previousPayload !== null && previousPayload === docPayload) {
                    continue;
                }
            }
        }

        result.push(line);
    }

    return result.join("\n");
}

function ensureBlankLineBeforeTopLevelLineComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];

    for (const line of lines) {
        const trimmedStart = line.trimStart();
        const isPlainLineComment =
            trimmedStart.startsWith("//") && !trimmedStart.startsWith("///") && trimmedStart === line;

        if (isPlainLineComment && result.length > 0) {
            const previousLine = result.at(-1);
            const previousTrimmedStart = typeof previousLine === "string" ? previousLine.trimStart() : undefined;
            const isPreviousPlainLineComment =
                typeof previousLine === "string" &&
                previousTrimmedStart !== undefined &&
                previousTrimmedStart.startsWith("//") &&
                !previousTrimmedStart.startsWith("///") &&
                previousTrimmedStart === previousLine;
            if (
                typeof previousLine === "string" &&
                previousLine.trim().length > 0 &&
                previousLine.trim() !== "}" &&
                !isPreviousPlainLineComment
            ) {
                result.push("");
            } else if (typeof previousLine === "string" && previousLine.trim() === "}") {
                result.push("");
            }
        }

        result.push(line);
    }

    return result.join("\n");
}

function trimWhitespaceAfterBlockComments(formatted: string): string {
    return formatted.replaceAll(/\*\/\r?\n[ \t]+/g, "*/\n");
}

function collectLineCommentTrailingWhitespace(source: string): Map<string, string[]> {
    const lines = source.split(/\r?\n/);
    const map = new Map<string, string[]>();

    for (const line of lines) {
        const trimmedStart = line.trimStart();
        const isPlainLineComment =
            trimmedStart.startsWith("//") && !trimmedStart.startsWith("///") && trimmedStart === line;

        if (!isPlainLineComment) {
            continue;
        }

        const withoutTrailing = line.replace(/[ \t]+$/, "");
        const trailingWhitespace = line.slice(withoutTrailing.length);
        if (trailingWhitespace.length === 0) {
            continue;
        }

        const normalized = line.trim();
        const queue = map.get(normalized) ?? [];
        queue.push(trailingWhitespace);
        map.set(normalized, queue);
    }

    return map;
}

function reapplyLineCommentTrailingWhitespace(formatted: string, source: string): string {
    const whitespaceMap = collectLineCommentTrailingWhitespace(source);
    if (whitespaceMap.size === 0) {
        return formatted;
    }

    const lines = formatted.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmedStart = line.trimStart();
        const isPlainLineComment =
            trimmedStart.startsWith("//") && !trimmedStart.startsWith("///") && trimmedStart === line;

        if (!isPlainLineComment) {
            continue;
        }

        const normalized = line.trim();
        const queue = whitespaceMap.get(normalized);
        if (!queue || queue.length === 0) {
            continue;
        }

        const trailing = queue.shift();
        if (typeof trailing === "string" && trailing.length > 0 && !line.endsWith(trailing)) {
            lines[index] = `${line}${trailing}`;
        }
    }

    return lines.join("\n");
}

function extractOptionDefaults(optionConfigMap: SupportOptions): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(optionConfigMap)
            .filter(([, config]) => config && Object.hasOwn(config, "default"))
            .map(([name, config]) => [name, (config as { default?: unknown }).default])
    );
}

function computeOptionDefaults(): Record<string, unknown> {
    return extractOptionDefaults(pluginOptions);
}

function createDefaultOptionsSnapshot(): GmlPluginDefaultOptions {
    const coreOptionOverrides = resolveCoreOptionOverrides();

    return {
        // Merge order:
        // GML Prettier defaults -> option defaults -> fixed overrides
        ...BASE_PRETTIER_DEFAULTS,
        ...computeOptionDefaults(),
        ...coreOptionOverrides
    };
}

const defaultOptions = Object.freeze(createDefaultOptionsSnapshot());

/**
 * Utility function & entry-point to format GML source code using the plugin.
 */
async function format(source: string, options: SupportOptions = {}) {
    const resolvedOptions = { ...defaultOptions, ...options };
    const formatted = await prettier.format(source, {
        ...resolvedOptions,
        parser: "gml-parse",
        plugins: [Plugin]
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }
    const normalized = ensureBlankLineBetweenVertexFormatComments(formatted);
    const singleBlankLines = collapseDuplicateBlankLines(normalized);
    const normalizedCleaned = singleBlankLines.endsWith("\n") ? singleBlankLines : `${singleBlankLines}\n`;
    const withoutFunctionTags = stripFunctionTagComments(normalizedCleaned);
    const collapsedAfterStrip = collapseDuplicateBlankLines(withoutFunctionTags);
    const dedupedComments = removeDuplicateDocLikeLineComments(collapseVertexFormatBeginSpacing(collapsedAfterStrip));
    const normalizedCommentSpacing = normalizeInlineTrailingCommentSpacing(dedupedComments);
    const spacedComments = ensureBlankLineBeforeTopLevelLineComments(normalizedCommentSpacing);
    const trimmedAfterBlockComments = trimWhitespaceAfterBlockComments(spacedComments);
    return reapplyLineCommentTrailingWhitespace(trimmedAfterBlockComments, source);
}

export { parsers, printers, pluginOptions, defaultOptions };
export { pluginOptions as options };

export const Plugin: GmlPlugin = {
    languages,
    parsers,
    printers,
    options: pluginOptions,
    defaultOptions,
    format
};
export default Plugin;
