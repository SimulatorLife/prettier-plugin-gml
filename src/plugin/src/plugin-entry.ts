/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import prettier, { type SupportLanguage, type SupportOptions } from "prettier";

import { gmlPluginComponents } from "./components/plugin-components.js";
import type { GmlPlugin, GmlPluginDefaultOptions } from "./components/plugin-types.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";
import { DEFAULT_PRINT_WIDTH, DEFAULT_TAB_WIDTH } from "./printer/constants.js";

export const parsers = gmlPluginComponents.parsers;
export const printers = gmlPluginComponents.printers;
export const pluginOptions = gmlPluginComponents.options;

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

export const defaultOptions = Object.freeze(createDefaultOptionsSnapshot());

/**
 * Utility function and entry point to format GML source code using the plugin.
 */
async function format(source: string, options: SupportOptions = {}) {
    const formatted = await prettier.format(source, {
        ...options,
        parser: "gml-parse",
        plugins: [Plugin]
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return formatted;
}

export const Plugin: GmlPlugin = {
    languages,
    parsers,
    printers,
    options: pluginOptions,
    defaultOptions,
    format
};
export default Plugin;
