/**
 * Entry point wiring the GameMaker Language formatter into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the formatter without reaching into internal modules.
 */

import prettier, { type SupportLanguage, type SupportOptions } from "prettier";

import { gmlFormatComponents } from "./components/format-components.js";
import type { GmlFormat, GmlFormatDefaultOptions } from "./components/format-types.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";
import { DEFAULT_PRINT_WIDTH, DEFAULT_TAB_WIDTH } from "./printer/constants.js";
import { normalizeFormattedOutput } from "./printer/normalize-formatted-output.js";

export const parsers = gmlFormatComponents.parsers;
export const printers = gmlFormatComponents.printers;
export const formatOptions = gmlFormatComponents.options;

export const languages: SupportLanguage[] = [
    {
        name: "GameMaker Language",
        extensions: [".gml"],
        parsers: ["gml-parse"],
        vscodeLanguageIds: ["gml-gms2", "gml"]
    }
];

const BASE_PRETTIER_DEFAULTS: Record<string, unknown> = {
    tabWidth: DEFAULT_TAB_WIDTH,
    semi: true,
    printWidth: DEFAULT_PRINT_WIDTH,
    bracketSpacing: false, // Keep false to match existing GML formatting expectations.
    singleQuote: false
};

function extractOptionDefaults(optionConfigMap: SupportOptions): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(optionConfigMap)
            .filter(([, config]) => config && Object.hasOwn(config, "default"))
            .map(([name, config]) => [name, (config as { default?: unknown }).default])
    );
}

const coreOptionOverrides = resolveCoreOptionOverrides();
const formatOptionDefaults = extractOptionDefaults(formatOptions);

export const defaultOptions: GmlFormatDefaultOptions = Object.freeze({
    // Merge order:
    // GML Prettier defaults -> option defaults -> fixed overrides
    ...BASE_PRETTIER_DEFAULTS,
    ...formatOptionDefaults,
    ...coreOptionOverrides
});

/**
 * Utility function and entry point to format GML source code.
 *
 * This is a thin, deterministic wrapper around {@link prettier.format}. It must
 * not inspect the original `source` to patch the formatted output — any
 * source-aware post-processing would make the formatter non-deterministic and
 * violate the formatter/linter split contract (target-state.md §3.2).
 *
 * After Prettier formats the source, the result is passed through
 * {@link normalizeFormattedOutput} to apply layout-only post-processing
 * deterministically (blank-line collapsing, banner spacing, trailing newline,
 * etc.). This step never consults the original `source`.
 */
async function format(source: string, options: SupportOptions = {}) {
    const prettierFormatOptions: Record<string, unknown> = {
        ...options,
        parser: "gml-parse",
        plugins: [Format]
    };

    const formatted = await prettier.format(source, prettierFormatOptions);

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return normalizeFormattedOutput(formatted);
}

export const Format: GmlFormat = {
    languages,
    parsers,
    printers,
    options: formatOptions,
    defaultOptions,
    format,
    normalizeFormattedOutput
};
export default Format;
