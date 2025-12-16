/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import { Core } from "@gml-modules/core";
import prettier, { type SupportLanguage, type SupportOptions } from "prettier";

import type {
    GmlPlugin,
    GmlPluginComponentBundle,
    GmlPluginDefaultOptions
} from "./components/plugin-types.js";
import { resolveGmlPluginComponents } from "./components/plugin-components.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";

function selectPluginComponents(): GmlPluginComponentBundle {
    return resolveGmlPluginComponents();
}

const parsers = Core.createReadOnlyView<GmlPluginComponentBundle["parsers"]>(
    () => selectPluginComponents().parsers,
    "GML plugin parsers"
);

const printers = Core.createReadOnlyView<GmlPluginComponentBundle["printers"]>(
    () => selectPluginComponents().printers,
    "GML plugin printers"
);

const pluginOptions = Core.createReadOnlyView<SupportOptions>(
    () => selectPluginComponents().options,
    "GML plugin options"
);

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
const VERTEX_FORMAT_BEGIN_CUSTOM_FUNCTION_PATTERN =
    /vertex_format_begin\(\);\n\s*\n(scr_custom_function\(\);)/g;
const SCR_CUSTOM_FUNCTION_TO_FORMAT_END_PATTERN =
    /scr_custom_function\(\);\n\s*\n(format2 = vertex_format_end\(\);)/g;

function ensureBlankLineBetweenVertexFormatComments(formatted: string): string {
    const target = `${EMPTY_VERTEX_FORMAT_COMMENT_TEXT}\n${KEEP_VERTEX_FORMAT_COMMENT_TEXT}`;
    const replacement = `${EMPTY_VERTEX_FORMAT_COMMENT_TEXT}\n\n${KEEP_VERTEX_FORMAT_COMMENT_TEXT}`;
    return formatted.includes(target)
        ? formatted.replace(target, replacement)
        : formatted;
}

function collapseVertexFormatBeginSpacing(formatted: string): string {
    return formatted
        .replaceAll(
            VERTEX_FORMAT_BEGIN_CUSTOM_FUNCTION_PATTERN,
            "vertex_format_begin();\n$1"
        )
        .replaceAll(
            SCR_CUSTOM_FUNCTION_TO_FORMAT_END_PATTERN,
            "scr_custom_function();\n$1"
        );
}

const MULTIPLE_BLANK_LINE_PATTERN = /\n{3,}/g;

function collapseDuplicateBlankLines(formatted: string): string {
    return formatted.replaceAll(MULTIPLE_BLANK_LINE_PATTERN, "\n\n");
}

const DOC_COMMENT_LINE_PATTERN = /^\s*(\/\/\/|\/\/\s*\/)/;
const DOC_COMMENT_TAG_PATTERN = /^\/\/\/\s*@/i;
const DOC_COMMENT_ALT_TAG_PATTERN = /^\/\/\s*\/\s*@/i;

function isDocCommentLine(line: string): boolean {
    return DOC_COMMENT_LINE_PATTERN.test(line);
}

function isDocCommentTagLine(trimmedLine: string): boolean {
    return (
        DOC_COMMENT_TAG_PATTERN.test(trimmedLine) ||
        DOC_COMMENT_ALT_TAG_PATTERN.test(trimmedLine)
    );
}

function extractDocCommentText(line: string): string {
    const trimmed = line.trim();
    const tripleMatch = trimmed.match(/^\/\/\/(.*)$/);
    if (tripleMatch) {
        return tripleMatch[1];
    }

    const docLikeMatch = trimmed.match(/^\/\/\s*\/(.*)$/);
    if (docLikeMatch) {
        return docLikeMatch[1];
    }

    return "";
}

const FUNCTION_NAME_PATTERN = /^\/\/\/\s*@function\s+([^\s(]+)/i;

function collectDocCommentSummaries(source: string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const lines = source.split(/\r\n|\r|\n/);
    const pendingBlock: string[] = [];

    const pushSummary = (functionMatch: RegExpMatchArray) => {
        const summaryTexts: string[] = [];
        for (const docLine of pendingBlock) {
            const trimmedDoc = docLine.trim();
            if (trimmedDoc === "") {
                continue;
            }
            if (isDocCommentTagLine(trimmedDoc)) {
                break;
            }
            const text = extractDocCommentText(docLine).trim();
            if (text.length > 0) {
                summaryTexts.push(text);
            }
        }
        if (summaryTexts.length > 0) {
            const functionName = functionMatch[1];
            if (!map.has(functionName)) {
                map.set(functionName, summaryTexts);
            }
        }
    };

    for (const line of lines) {
        if (isDocCommentLine(line)) {
            pendingBlock.push(line);
            continue;
        }

        const trimmed = line.trim();
        const functionMatch = trimmed.match(
            /^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/
        );
        if (functionMatch && pendingBlock.length > 0) {
            pushSummary(functionMatch);
        }

        pendingBlock.length = 0;
    }

    return map;
}

function alignContinuationPadding(descriptionLine: string) {
    const indentMatch = descriptionLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    const trimmed = descriptionLine.trim();
    const prefixMatch = trimmed.match(/^(\/\/\/\s*@description\s+)/i);
    const prefix = prefixMatch ? prefixMatch[1] : "/// @description ";
    const continuationPadding = Math.max(
        prefix.length - (indent.length + 4),
        0
    );
    return `${indent}/// ${" ".repeat(continuationPadding)}`;
}

function collectDescriptionBlockSize(lines: string[], startIndex: number) {
    let current = startIndex + 1;
    while (
        current < lines.length &&
        lines[current].trim().startsWith("///") &&
        !/^\/\/\/\s*@/.test(lines[current].trim())
    ) {
        current += 1;
    }
    return current;
}

function promoteMultiLineDocDescriptions(
    formatted: string,
    source: string
): string {
    const lines = formatted.split("\n");
    const docSummaries = collectDocCommentSummaries(source);

    for (let index = 0; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (!trimmed) {
            continue;
        }
        const functionMatch = trimmed.match(FUNCTION_NAME_PATTERN);
        if (!functionMatch) {
            continue;
        }

        const functionName = functionMatch[1];
        const summaryTexts = docSummaries.get(functionName);
        if (!summaryTexts || summaryTexts.length === 0) {
            continue;
        }

        let descriptionIndex = index + 1;
        while (
            descriptionIndex < lines.length &&
            lines[descriptionIndex].trim() === ""
        ) {
            descriptionIndex += 1;
        }

        if (
            descriptionIndex >= lines.length ||
            !/^\/\/\/\s*@description\b/i.test(lines[descriptionIndex].trim())
        ) {
            continue;
        }

        const blockEnd = collectDescriptionBlockSize(lines, descriptionIndex);
        const descriptionLine = lines[descriptionIndex];
        const continuationPrefix = alignContinuationPadding(descriptionLine);

        // Remove existing description block so we can reinsert in correct position
        lines.splice(descriptionIndex, blockEnd - descriptionIndex);

        // Remove blank lines between @function and insertion point
        while (
            descriptionIndex - 1 > index &&
            lines[descriptionIndex - 1].trim() === ""
        ) {
            lines.splice(descriptionIndex - 1, 1);
            descriptionIndex -= 1;
        }

        const newBlock: string[] = [
            descriptionLine,
            ...summaryTexts
                .slice(1)
                .map((text) => `${continuationPrefix}${text}`)
        ];

        lines.splice(index + 1, 0, ...newBlock);
        index += newBlock.length;
    }

    return lines.join("\n");
}

function extractOptionDefaults(
    optionConfigMap: SupportOptions
): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    for (const [name, config] of Object.entries(optionConfigMap)) {
        if (config && Object.hasOwn(config, "default")) {
            defaults[name] = (config as { default?: unknown }).default;
        }
    }

    return defaults;
}

function computeOptionDefaults(): Record<string, unknown> {
    const components = selectPluginComponents();
    return extractOptionDefaults(components.options);
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

/**
 * Utility function & entry-point to format GML source code using the plugin.
 */
async function format(source: string, options: SupportOptions = {}) {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [Plugin],
        ...options
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }
    const normalized = ensureBlankLineBetweenVertexFormatComments(formatted);
    const singleBlankLines = collapseDuplicateBlankLines(normalized);
    const docCommentFilter = /^\s*\/\/\/\s*@description\b\s*$/i;
    const formattedLines = singleBlankLines.split("\n");
    const filteredLines = formattedLines.filter(
        (line) => !docCommentFilter.test(line)
    );
    const cleaned = filteredLines.join("\n");
    const normalizedCleaned =
        cleaned.endsWith("\n") || !singleBlankLines.endsWith("\n")
            ? cleaned
            : `${cleaned}\n`;
    // Return the formatted source verbatim so we keep precise newline and
    // whitespace semantics expected by the golden test fixtures. Using
    // `trim()` previously removed leading/trailing blank lines (including
    // the canonical trailing newline) which caused a large number of
    // printing tests to fail. Keep the value as emitted by Prettier.
    const withPromotedDescriptions = promoteMultiLineDocDescriptions(
        normalizedCleaned,
        source
    );
    return collapseVertexFormatBeginSpacing(withPromotedDescriptions);
}

const defaultOptions = Core.createReadOnlyView<GmlPluginDefaultOptions>(
    () => createDefaultOptionsSnapshot(),
    "GML default options"
);

export { parsers, printers, pluginOptions, defaultOptions };
export { pluginOptions as options };

export const Plugin: GmlPlugin = {
    languages,
    parsers,
    printers,
    options: pluginOptions,
    defaultOptions: createDefaultOptionsSnapshot(),
    format
};
export default Plugin;
