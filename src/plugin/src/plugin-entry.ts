/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import prettier, { type SupportLanguage, type SupportOptions } from "prettier";

import type { GmlPlugin, GmlPluginDefaultOptions } from "./components/plugin-types.js";
import { gmlPluginComponents } from "./components/plugin-components.js";
import { normalizeFormattedOutput } from "./format-normalizer.js";
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
    bracketSpacing: false, // Changed to false to maintain backward compatibility with existing GML code
    singleQuote: false
};

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
    return normalizeFormattedOutput(formatted, source);
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
