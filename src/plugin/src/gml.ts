/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import { Core } from "@gml-modules/core";
import type { SupportLanguage, SupportOptions } from "prettier";

import type {
    GmlPlugin,
    GmlPluginComponentBundle,
    GmlPluginDefaultOptions
} from "./plugin-types.js";
import { resolveGmlPluginComponents } from "./plugin-components.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";

function selectPluginComponents(): GmlPluginComponentBundle {
    return resolveGmlPluginComponents();
}

const parsers = Core.Utils.createReadOnlyView<
    GmlPluginComponentBundle["parsers"]
>(() => selectPluginComponents().parsers, "GML plugin parsers");

const printers = Core.Utils.createReadOnlyView<
    GmlPluginComponentBundle["printers"]
>(() => selectPluginComponents().printers, "GML plugin printers");

const options = Core.Utils.createReadOnlyView<SupportOptions>(
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

const defaultOptions = Core.Utils.createReadOnlyView<GmlPluginDefaultOptions>(
    () => createDefaultOptionsSnapshot(),
    "GML default options"
);

export { parsers, printers, options, defaultOptions };

const pluginBundle: GmlPlugin = {
    languages,
    parsers,
    printers,
    options,
    defaultOptions
};

export const Plugin = Object.freeze(pluginBundle);
