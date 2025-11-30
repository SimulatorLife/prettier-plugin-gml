/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import { Core } from "@gml-modules/core";
import prettier, {
    type SupportLanguage,
    type SupportOptions
} from "prettier";

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

export const languages: ReadonlyArray<SupportLanguage> = [
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
async function format(
    source: string,
    options: SupportOptions = {}
) {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [Plugin],
        ...options
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    // Return the formatted source verbatim so we keep precise newline and
    // whitespace semantics expected by the golden test fixtures. Using
    // `trim()` previously removed leading/trailing blank lines (including
    // the canonical trailing newline) which caused a large number of
    // printing tests to fail. Keep the value as emitted by Prettier.
    return formatted;
}

const defaultOptions = Core.createReadOnlyView<GmlPluginDefaultOptions>(
    () => createDefaultOptionsSnapshot(),
    "GML default options"
);

export { parsers, printers, pluginOptions, defaultOptions };

const pluginBundle: GmlPlugin = {
    languages: [...languages],
    parsers,
    printers,
        pluginOptions,
    defaultOptions,
    format
};

export const Plugin = Object.freeze(pluginBundle);
export default Plugin;
