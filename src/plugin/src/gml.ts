/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import { resolveGmlPluginComponents } from "./plugin-components.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";

function selectPluginComponents() {
    return resolveGmlPluginComponents();
}

function createReadOnlyView(selector, description) {
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

    const withSource = (callback) => callback(ensureSource());

    return new Proxy(Object.create(null), {
        get(_target, property, receiver) {
            if (property === Symbol.toStringTag) {
                return "Object";
            }

            return withSource((source) =>
                Reflect.get(source, property, receiver)
            );
        },
        has(_target, property) {
            return withSource((source) => Reflect.has(source, property));
        },
        ownKeys() {
            return withSource((source) => Reflect.ownKeys(source));
        },
        getOwnPropertyDescriptor(_target, property) {
            return withSource((source) => {
                const descriptor = Reflect.getOwnPropertyDescriptor(
                    source,
                    property
                );

                if (!descriptor) {
                    return;
                }

                return {
                    configurable: true,
                    enumerable: descriptor.enumerable ?? true,
                    value: descriptor.value,
                    writable: false
                };
            });
        },
        getPrototypeOf() {
            return Object.prototype;
        },
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
    const coreOptionOverrides = resolveCoreOptionOverrides();

    return {
        // Merge order:
        // GML Prettier defaults -> option defaults -> fixed overrides
        ...BASE_PRETTIER_DEFAULTS,
        ...computeOptionDefaults(),
        ...coreOptionOverrides
    };
}

const defaultOptions = createReadOnlyView(
    () => createDefaultOptionsSnapshot(),
    "GML default options"
);

export { parsers, printers, options, defaultOptions };
