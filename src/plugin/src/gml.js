/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import { resolveGmlPluginComponents } from "./plugin-components.js";

const { parsers, printers, options } = resolveGmlPluginComponents();

export const languages = [
    {
        name: "GameMaker Language",
        extensions: [".gml"],
        parsers: ["gml-parse"],
        vscodeLanguageIds: ["gml-gms2", "gml"]
    }
];

export { parsers, printers, options };

// Hard overrides for GML regardless of incoming config
// These options are incompatible with GML or have no effect
// So we force them to a specific value
const CORE_OPTION_OVERRIDES = {
    trailingComma: "none",
    arrowParens: "always",
    singleAttributePerLine: false,
    jsxSingleQuote: false,
    proseWrap: "preserve",
    htmlWhitespaceSensitivity: "css"
};

const BASE_PRETTIER_DEFAULTS = {
    tabWidth: 4,
    semi: true,
    printWidth: 120,
    bracketSpacing: true,
    singleQuote: false
};

function extractOptionDefaults(optionConfigMap) {
    const defaults = {};

    for (const [name, config] of Object.entries(optionConfigMap)) {
        if (config && Object.hasOwn(config, "default")) {
            defaults[name] = config.default;
        }
    }

    return defaults;
}

const gmlOptionDefaults = extractOptionDefaults(options);

export const defaultOptions = {
    // Merge order:
    // GML Prettier defaults -> option defaults -> fixed overrides
    ...BASE_PRETTIER_DEFAULTS,
    ...gmlOptionDefaults,
    ...CORE_OPTION_OVERRIDES
};
