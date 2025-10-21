/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import {
    addGmlPluginComponentObserver,
    resolveGmlPluginComponents
} from "./plugin-components.js";

export let parsers;
export let printers;
export let options;
export let defaultOptions;

function refreshPluginComponentState(componentBundle) {
    const components = componentBundle ?? resolveGmlPluginComponents();

    parsers = components.parsers;
    printers = components.printers;
    options = components.options;

    defaultOptions = {
        ...BASE_PRETTIER_DEFAULTS,
        ...extractOptionDefaults(options),
        ...CORE_OPTION_OVERRIDES
    };

    return components;
}

export const languages = [
    {
        name: "GameMaker Language",
        extensions: [".gml"],
        parsers: ["gml-parse"],
        vscodeLanguageIds: ["gml-gms2", "gml"]
    }
];

// Hard overrides for GML regardless of incoming config. These knobs either map
// to syntax that GameMaker never emits (for example JSX attributes) or would
// let callers re-enable formatting modes the printers deliberately avoid. The
// fixtures showcased in README.md#formatter-at-a-glance and the
// docs/examples/* snapshots all assume "no trailing commas" plus
// "always-parenthesised arrow parameters", so letting user configs flip those
// bits would desynchronise the documented contract from the code we ship. We
// therefore clamp the values here to advertise a single canonical style and to
// prevent project-level `.prettierrc` files from surfacing ineffective or
// misleading toggles.
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

refreshPluginComponentState();

addGmlPluginComponentObserver(refreshPluginComponentState);
