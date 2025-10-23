/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import { resolveGmlPluginComponents } from "./plugin-components.js";

function selectPluginComponents() {
    return resolveGmlPluginComponents();
}

function createReadOnlyView(selector, description) {
    const base = Object.create(null);
    const readOnlyError = new TypeError(
        `${description} cannot be modified once resolved.`
    );

    const ensureSource = () => {
        const source = selector();
        if (source && typeof source === "object") {
            return source;
        }

        throw new TypeError(`${description} must resolve to an object.`);
    };

    const throwReadOnlyError = () => {
        throw readOnlyError;
    };

    const forward =
        (method) =>
        (_target, ...args) =>
            Reflect[method](ensureSource(), ...args);

    return new Proxy(base, {
        get: (_target, property, receiver) => {
            if (property === Symbol.toStringTag) {
                return "Object";
            }

            return Reflect.get(ensureSource(), property, receiver);
        },
        has: forward("has"),
        ownKeys: forward("ownKeys"),
        getOwnPropertyDescriptor: (_target, property) => {
            const descriptor = Reflect.getOwnPropertyDescriptor(
                ensureSource(),
                property
            );

            if (!descriptor) {
                return;
            }

            return {
                configurable: true,
                enumerable:
                    descriptor.enumerable === undefined
                        ? true
                        : descriptor.enumerable,
                value: descriptor.value,
                writable: false
            };
        },
        getPrototypeOf: () => Object.prototype,
        set: throwReadOnlyError,
        defineProperty: throwReadOnlyError,
        deleteProperty: throwReadOnlyError
    });
}

const parsers = createReadOnlyView(
    () => selectPluginComponents().parsers,
    "GML plugin parsers"
);

const printers = createReadOnlyView(
    () => selectPluginComponents().printers,
    "GML plugin printers"
);

const options = createReadOnlyView(
    () => selectPluginComponents().options,
    "GML plugin options"
);

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
// bits would desynchronize the documented contract from the code we ship. We
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

function computeOptionDefaults() {
    const components = selectPluginComponents();
    return extractOptionDefaults(components.options);
}

function createDefaultOptionsSnapshot() {
    return {
        // Merge order:
        // GML Prettier defaults -> option defaults -> fixed overrides
        ...BASE_PRETTIER_DEFAULTS,
        ...computeOptionDefaults(),
        ...CORE_OPTION_OVERRIDES
    };
}

const defaultOptions = createReadOnlyView(
    () => createDefaultOptionsSnapshot(),
    "GML default options"
);

export { parsers, printers, options, defaultOptions };
