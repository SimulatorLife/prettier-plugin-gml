import path from "node:path";
import process from "node:process";

import { wrapInvalidArgumentResolver } from "./command-parsing.js";
import {
    DEFAULT_MANUAL_REPO,
    createManualVerboseState,
    resolveManualRepoValue
} from "./manual-utils.js";
import {
    getDefaultProgressBarWidth,
    resolveProgressBarWidth
} from "./progress-bar.js";

const hasOwnProperty = Object.prototype.hasOwnProperty;

function resolveDefaultValue(option, name, fallback) {
    const config = option ?? {};

    if (hasOwnProperty.call(config, "defaultValue")) {
        return config.defaultValue;
    }

    if (typeof fallback === "function") {
        return fallback();
    }

    if (fallback !== undefined) {
        return fallback;
    }

    throw new TypeError(`${name}.defaultValue must be provided.`);
}

function createPathOption(option, { flag, describe, name, fallbackDefault }) {
    if (option === false) {
        return null;
    }

    const config = option ?? {};
    const defaultValue = resolveDefaultValue(config, name, fallbackDefault);
    const description =
        typeof config.description === "string" && config.description.length > 0
            ? config.description
            : describe(defaultValue);
    const normalize =
        typeof config.normalize === "function"
            ? config.normalize
            : (value) => path.resolve(value);

    return {
        flag: config.flag ?? flag,
        description,
        defaultValue,
        normalize
    };
}

function createWrappedOption(
    option,
    { flag, describe, name, fallbackDefault, resolver }
) {
    if (option === false) {
        return null;
    }

    const config = option ?? {};
    const defaultValue = resolveDefaultValue(config, name, fallbackDefault);
    const description =
        typeof config.description === "string" && config.description.length > 0
            ? config.description
            : describe(defaultValue);
    const resolveFn =
        typeof config.resolve === "function" ? config.resolve : resolver;

    if (typeof resolveFn !== "function") {
        throw new TypeError(`${name}.resolve must be a function.`);
    }

    return {
        flag: config.flag ?? flag,
        description,
        defaultValue,
        mapValue: wrapInvalidArgumentResolver(resolveFn)
    };
}

function createOptionOrder({ optionOrder, handlers, customHandlers }) {
    const defaultOrder = [
        "outputPath",
        "forceRefresh",
        "quiet",
        "manualRepo",
        "cacheRoot",
        "progressBarWidth"
    ];

    const seen = new Set();
    const sequence = [];

    function add(key) {
        if (seen.has(key)) {
            return;
        }

        if (!handlers.has(key) && !customHandlers.has(key)) {
            return;
        }

        seen.add(key);
        sequence.push(key);
    }

    if (Array.isArray(optionOrder)) {
        for (const key of optionOrder) {
            add(key);
        }
    }

    for (const key of defaultOrder) {
        add(key);
    }

    for (const key of customHandlers.keys()) {
        add(key);
    }

    return sequence;
}

export function applySharedManualCommandOptions(
    command,
    {
        outputPath,
        cacheRoot,
        manualRepo,
        progressBarWidth,
        quietDescription = "Suppress progress output (useful in CI).",
        forceRefreshDescription = "Ignore cached manual artefacts and re-download.",
        optionOrder,
        customOptions
    } = {}
) {
    if (!command || typeof command.option !== "function") {
        throw new TypeError("command must provide an option function");
    }

    const outputOption = createPathOption(outputPath, {
        flag: "-o, --output <path>",
        describe: (value) => `Output JSON path (default: ${value}).`,
        name: "outputPath"
    });

    const cacheOption = createPathOption(cacheRoot, {
        flag: "--cache-root <path>",
        describe: (value) =>
            `Directory to store cached manual artefacts (default: ${value}).`,
        name: "cacheRoot"
    });

    const progressOption = createWrappedOption(progressBarWidth, {
        flag: "--progress-bar-width <columns>",
        describe: (value) =>
            `Width of progress bars rendered in the terminal (default: ${value}).`,
        name: "progressBarWidth",
        fallbackDefault: () => getDefaultProgressBarWidth(),
        resolver: resolveProgressBarWidth
    });

    const manualRepoOption = createWrappedOption(manualRepo, {
        flag: "--manual-repo <owner/name>",
        describe: (value) =>
            `GitHub repository hosting the manual (default: ${value}).`,
        name: "manualRepo",
        fallbackDefault: () => DEFAULT_MANUAL_REPO,
        resolver: resolveManualRepoValue
    });

    const handlers = new Map();

    if (outputOption) {
        handlers.set("outputPath", () =>
            command.option(
                outputOption.flag,
                outputOption.description,
                outputOption.normalize,
                outputOption.defaultValue
            )
        );
    }

    if (forceRefreshDescription !== false) {
        handlers.set("forceRefresh", () =>
            command.option("--force-refresh", forceRefreshDescription)
        );
    }

    if (quietDescription !== false) {
        handlers.set("quiet", () =>
            command.option("--quiet", quietDescription)
        );
    }

    if (progressOption) {
        handlers.set("progressBarWidth", () =>
            command.option(
                progressOption.flag,
                progressOption.description,
                progressOption.mapValue,
                progressOption.defaultValue
            )
        );
    }

    if (manualRepoOption) {
        handlers.set("manualRepo", () =>
            command.option(
                manualRepoOption.flag,
                manualRepoOption.description,
                manualRepoOption.mapValue,
                manualRepoOption.defaultValue
            )
        );
    }

    if (cacheOption) {
        handlers.set("cacheRoot", () =>
            command.option(
                cacheOption.flag,
                cacheOption.description,
                cacheOption.normalize,
                cacheOption.defaultValue
            )
        );
    }

    const customHandlers = new Map();
    if (customOptions && typeof customOptions === "object") {
        for (const [key, handler] of Object.entries(customOptions)) {
            if (typeof handler === "function") {
                customHandlers.set(key, () => handler(command));
            }
        }
    }

    const sequence = createOptionOrder({
        optionOrder,
        handlers,
        customHandlers
    });

    for (const key of sequence) {
        if (handlers.has(key)) {
            handlers.get(key)();
            continue;
        }

        const customHandler = customHandlers.get(key);
        if (customHandler) {
            customHandler();
        }
    }

    return command;
}

/**
 * Normalize shared manual command options and merge command-specific extras.
 *
 * @param {import("commander").Command} command CLI command instance.
 * @param {{
 *   defaults?: {
 *     ref?: string | null,
 *     outputPath?: string,
 *     cacheRoot?: string,
 *     manualRepo?: string
 *   },
 *   mapExtras?: (context: {
 *     options: Record<string, unknown>,
 *     resolved: Record<string, unknown>
 *   }) => Record<string, unknown> | null | undefined
 * }} [config]
 * @returns {Record<string, unknown>} Normalized option record.
 */
export function resolveManualCommandOptions(
    command,
    { defaults = {}, mapExtras } = {}
) {
    const options = typeof command?.opts === "function" ? command.opts() : {};
    const isTty = process.stdout.isTTY === true;

    const verbose = createManualVerboseState({
        quiet: Boolean(options.quiet),
        isTerminal: isTty
    });

    const {
        ref: refFallback,
        outputPath: outputFallback,
        cacheRoot: cacheRootFallback,
        manualRepo: manualRepoFallback
    } = defaults;

    const resolved = {
        ref: options.ref ?? refFallback,
        outputPath: options.output ?? outputFallback,
        forceRefresh: Boolean(options.forceRefresh),
        verbose,
        progressBarWidth:
            options.progressBarWidth ?? getDefaultProgressBarWidth(),
        cacheRoot: options.cacheRoot ?? cacheRootFallback,
        manualRepo: options.manualRepo ?? manualRepoFallback,
        usage:
            typeof command?.helpInformation === "function"
                ? command.helpInformation()
                : undefined
    };

    if (typeof mapExtras === "function") {
        const extras = mapExtras({ options, resolved });
        if (extras && typeof extras === "object") {
            return { ...resolved, ...extras };
        }
    }

    return resolved;
}
