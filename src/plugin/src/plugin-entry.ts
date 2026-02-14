/**
 * Entry point wiring the GameMaker Language plugin into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the plugin without reaching into internal modules.
 */

import prettier, { type SupportLanguage, type SupportOptions } from "prettier";

import { gmlPluginComponents } from "./components/plugin-components.js";
import type { GmlPlugin, GmlPluginDefaultOptions } from "./components/plugin-types.js";
import { DEFAULT_PRINT_WIDTH, DEFAULT_TAB_WIDTH } from "./constants.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";
import { type IdentifierCaseRuntime, setIdentifierCaseRuntime } from "./parsers/index.js";
import { normalizeFormattedOutput } from "./printer/normalize-formatted-output.js";

const parsers = gmlPluginComponents.parsers;
const printers = gmlPluginComponents.printers;
const pluginOptions = gmlPluginComponents.options;

type IdentifierCasePrinterServices = {
    renameLookupService: (node: unknown, options: Record<string, unknown> | null | undefined) => string | null;
    applySnapshotService: (
        snapshot: unknown,
        options: Record<string, unknown> | null | undefined
    ) => void | Promise<void>;
    dryRunReportService: (options: Record<string, unknown> | null | undefined) => unknown;
    teardownService: (options: Record<string, unknown> | null | undefined) => void | Promise<void>;
};

const DEFAULT_IDENTIFIER_CASE_PRINTER_SERVICES: IdentifierCasePrinterServices = Object.freeze({
    renameLookupService: () => null,
    applySnapshotService: () => {},
    dryRunReportService: () => null,
    teardownService: () => {}
});

let identifierCasePrinterServices: IdentifierCasePrinterServices = DEFAULT_IDENTIFIER_CASE_PRINTER_SERVICES;

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

const defaultOptions = Object.freeze(createDefaultOptionsSnapshot());

function withIdentifierCasePrinterServices(options: Record<string, unknown>): Record<string, unknown> {
    const decorated = { ...options };

    setMissingFunctionOption(
        decorated,
        "__identifierCaseRenameLookupService",
        identifierCasePrinterServices.renameLookupService
    );
    setMissingFunctionOption(
        decorated,
        "__identifierCaseApplySnapshotService",
        identifierCasePrinterServices.applySnapshotService
    );
    setMissingFunctionOption(
        decorated,
        "__identifierCaseDryRunReportService",
        identifierCasePrinterServices.dryRunReportService
    );
    setMissingFunctionOption(
        decorated,
        "__identifierCaseTeardownService",
        identifierCasePrinterServices.teardownService
    );

    return decorated;
}

function setMissingFunctionOption(
    options: Record<string, unknown>,
    optionName: string,
    service: (...args: Array<unknown>) => unknown
): void {
    if (typeof options[optionName] === "function") {
        return;
    }

    options[optionName] = service;
}

function assertSupportOptionsShape(options: Record<string, unknown>): asserts options is SupportOptions {
    for (const [optionName, optionConfig] of Object.entries(options)) {
        if (typeof optionConfig !== "object" || optionConfig === null) {
            throw new TypeError(`Expected identifier-case option '${optionName}' to be an object.`);
        }

        const optionType = Reflect.get(optionConfig, "type");
        if (
            optionType !== "boolean" &&
            optionType !== "choice" &&
            optionType !== "int" &&
            optionType !== "path" &&
            optionType !== "string"
        ) {
            throw new TypeError(`Expected identifier-case option '${optionName}' to declare a supported type.`);
        }
    }
}

/**
 * Configures identifier-case integration hooks used by the parser/printer pipeline.
 *
 * @param {{
 *     runtime?: IdentifierCaseRuntime;
 *     printerServices?: Partial<IdentifierCasePrinterServices>;
 *     identifierCaseOptions?: Record<string, unknown>;
 * }} [configuration] Optional runtime + printer service overrides.
 */
export function configureIdentifierCaseIntegration(
    configuration: {
        runtime?: IdentifierCaseRuntime;
        printerServices?: Partial<IdentifierCasePrinterServices>;
        identifierCaseOptions?: Record<string, unknown>;
    } = {}
): void {
    if (configuration.runtime) {
        setIdentifierCaseRuntime(configuration.runtime);
    }

    if (configuration.printerServices) {
        identifierCasePrinterServices = {
            ...identifierCasePrinterServices,
            ...configuration.printerServices
        };
    }

    if (configuration.identifierCaseOptions) {
        assertSupportOptionsShape(configuration.identifierCaseOptions);
        Plugin.options = Object.freeze({
            ...pluginOptions,
            ...configuration.identifierCaseOptions
        });
    }
}

/**
 * Utility function and entry point to format GML source code using the plugin.
 */
async function format(source: string, options: SupportOptions = {}) {
    const resolvedOptions = withIdentifierCasePrinterServices({
        ...defaultOptions,
        ...options
    });
    try {
        const formatted = await prettier.format(source, {
            ...(resolvedOptions as SupportOptions),
            parser: "gml-parse",
            plugins: [Plugin]
        });

        identifierCasePrinterServices.dryRunReportService(resolvedOptions);

        if (typeof formatted !== "string") {
            throw new TypeError("Expected Prettier to return a string result.");
        }

        return normalizeFormattedOutput(formatted, source);
    } finally {
        await identifierCasePrinterServices.teardownService(resolvedOptions);
    }
}

export { defaultOptions, parsers, pluginOptions, printers };
export { normalizeFormattedOutput } from "./printer/normalize-formatted-output.js";
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

export { setIdentifierCaseRuntime } from "./parsers/index.js";
