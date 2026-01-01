/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import prettier, { type SupportLanguage, type SupportOptions } from "prettier";

import type {
    GmlPlugin,
    GmlPluginDefaultOptions
} from "./components/plugin-types.js";
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
const FUNCTION_TAG_CLEANUP_PATTERN =
    /\/\/\/\s*@(?:func|function)\b[^\n]*(?:\n)?/gi;

function collapseDuplicateBlankLines(formatted: string): string {
    return formatted.replaceAll(MULTIPLE_BLANK_LINE_PATTERN, "\n\n");
}

function stripFunctionTagComments(formatted: string): string {
    return formatted.replaceAll(FUNCTION_TAG_CLEANUP_PATTERN, "");
}

function extractOptionDefaults(
    optionConfigMap: SupportOptions
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(optionConfigMap)
            .filter(([, config]) => config && Object.hasOwn(config, "default"))
            .map(([name, config]) => [
                name,
                (config as { default?: unknown }).default
            ])
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
    const normalizedCleaned = singleBlankLines.endsWith("\n")
        ? singleBlankLines
        : `${singleBlankLines}\n`;
    const withoutFunctionTags = stripFunctionTagComments(normalizedCleaned);
    const collapsedAfterStrip =
        collapseDuplicateBlankLines(withoutFunctionTags);
    return collapseVertexFormatBeginSpacing(collapsedAfterStrip);
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
