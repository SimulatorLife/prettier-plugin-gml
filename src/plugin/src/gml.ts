/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import type { SupportLanguage, SupportOptions } from "prettier";

import type {
    GmlPluginComponentBundle,
    GmlPluginDefaultOptions
} from "./plugin-types.js";
import { resolveGmlPluginComponents } from "./plugin-components.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";

function selectPluginComponents(): GmlPluginComponentBundle {
    return resolveGmlPluginComponents();
}

function createReadOnlyView<T extends object>(
    selector: () => T,
    description: string
): Readonly<T> {
    const readOnlyError = new TypeError(
        `${description} cannot be modified once resolved.`
    );

    const ensureSource = (): T => {
        const source = selector();
        if (source && typeof source === "object") {
            return source;
        }

        throw new TypeError(`${description} must resolve to an object.`);
    };

    const withSource = <TReturn>(callback: (source: T) => TReturn): TReturn =>
        callback(ensureSource());

    const throwReadOnlyError = (): never => {
        throw readOnlyError;
    };

    const target = Object.create(null) as T;

    return new Proxy(target, {
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
                    return undefined;
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
        set() {
            throwReadOnlyError();
        },
        defineProperty() {
            throwReadOnlyError();
        },
        deleteProperty() {
            throwReadOnlyError();
        }
    }) as Readonly<T>;
}

const parsers = createReadOnlyView<GmlPluginComponentBundle["parsers"]>(
    () => selectPluginComponents().parsers,
    "GML plugin parsers"
);

const printers = createReadOnlyView<GmlPluginComponentBundle["printers"]>(
    () => selectPluginComponents().printers,
    "GML plugin printers"
);

const options = createReadOnlyView<SupportOptions>(
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

const defaultOptions = createReadOnlyView<GmlPluginDefaultOptions>(
    () => createDefaultOptionsSnapshot(),
    "GML default options"
);

export { parsers, printers, options, defaultOptions };
