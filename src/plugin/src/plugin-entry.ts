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
    const normalizedCleaned = singleBlankLines.endsWith("\n")
        ? `${cleaned}\n`
        : cleaned;
    // Return the formatted source verbatim so we keep precise newline and
    // whitespace semantics expected by the golden test fixtures. Using
    // `trim()` previously removed leading/trailing blank lines (including
    // the canonical trailing newline) which caused a large number of
    // printing tests to fail. Keep the value as emitted by Prettier.
    return collapseVertexFormatBeginSpacing(normalizedCleaned);
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
