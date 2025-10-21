import path from "node:path";
import process from "node:process";

import { wrapInvalidArgumentResolver } from "./command-parsing.js";
import {
    DEFAULT_MANUAL_REPO,
    createManualVerboseState,
    resolveManualRepoValue
} from "./manual/utils.js";
import {
    getDefaultProgressBarWidth,
    resolveProgressBarWidth
} from "./progress-bar.js";
import { assertFunction, hasOwn } from "./shared/object-utils.js";
import { isNonEmptyString } from "./shared/string-utils.js";

function resolveDefaultValue(option, name, fallback) {
    const config = option ?? {};

    if (hasOwn(config, "defaultValue")) {
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

function resolveManualOptionBaseConfig(
    option,
    { flag, describe, name, fallbackDefault }
) {
    if (option === false) {
        return null;
    }

    const config = option ?? {};
    const defaultValue = resolveDefaultValue(config, name, fallbackDefault);
    const description = isNonEmptyString(config.description)
        ? config.description
        : describe(defaultValue);

    return {
        config,
        flag: config.flag ?? flag,
        defaultValue,
        description
    };
}

const DEFAULT_OPTION_ORDER = Object.freeze([
    "outputPath",
    "forceRefresh",
    "quiet",
    "manualRepo",
    "cacheRoot",
    "progressBarWidth"
]);

function createOptionOrder({ optionOrder, handlers, customHandlers }) {
    const preferredOrder = Array.isArray(optionOrder) ? optionOrder : [];
    const customKeys = Array.from(customHandlers.keys());
    const ordering = new Set([
        ...preferredOrder,
        ...DEFAULT_OPTION_ORDER,
        ...customKeys
    ]);

    return [...ordering].filter(
        (key) => handlers.has(key) || customHandlers.has(key)
    );
}

const DEFAULT_PATH_NORMALIZER = (value) => path.resolve(value);

function registerManualOption({ handlers, key, option, configure }) {
    if (!option) {
        return;
    }

    assertFunction(configure, "configure");
    handlers.set(key, () => configure(option));
}

function configurePathOption(command, option) {
    const normalize =
        typeof option.config.normalize === "function"
            ? option.config.normalize
            : DEFAULT_PATH_NORMALIZER;

    command.option(
        option.flag,
        option.description,
        normalize,
        option.defaultValue
    );
}

function configureResolvedOption({
    command,
    option,
    fallbackResolve,
    resolverName
}) {
    const resolveFn =
        typeof option.config.resolve === "function"
            ? option.config.resolve
            : fallbackResolve;

    assertFunction(resolveFn, resolverName);

    command.option(
        option.flag,
        option.description,
        wrapInvalidArgumentResolver(resolveFn),
        option.defaultValue
    );
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

    const outputOption = resolveManualOptionBaseConfig(outputPath, {
        flag: "-o, --output <path>",
        describe: (value) => `Output JSON path (default: ${value}).`,
        name: "outputPath"
    });

    const cacheOption = resolveManualOptionBaseConfig(cacheRoot, {
        flag: "--cache-root <path>",
        describe: (value) =>
            `Directory to store cached manual artefacts (default: ${value}).`,
        name: "cacheRoot"
    });

    const progressOption = resolveManualOptionBaseConfig(progressBarWidth, {
        flag: "--progress-bar-width <columns>",
        describe: (value) =>
            `Width of progress bars rendered in the terminal (default: ${value}).`,
        name: "progressBarWidth",
        fallbackDefault: () => getDefaultProgressBarWidth()
    });

    const manualRepoOption = resolveManualOptionBaseConfig(manualRepo, {
        flag: "--manual-repo <owner/name>",
        describe: (value) =>
            `GitHub repository hosting the manual (default: ${value}).`,
        name: "manualRepo",
        fallbackDefault: () => DEFAULT_MANUAL_REPO
    });

    const handlers = new Map();

    registerManualOption({
        handlers,
        key: "outputPath",
        option: outputOption,
        configure: (option) => configurePathOption(command, option)
    });

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

    registerManualOption({
        handlers,
        key: "progressBarWidth",
        option: progressOption,
        configure: (option) =>
            configureResolvedOption({
                command,
                option,
                fallbackResolve: resolveProgressBarWidth,
                resolverName: "progressBarWidth.resolve"
            })
    });

    registerManualOption({
        handlers,
        key: "manualRepo",
        option: manualRepoOption,
        configure: (option) =>
            configureResolvedOption({
                command,
                option,
                fallbackResolve: resolveManualRepoValue,
                resolverName: "manualRepo.resolve"
            })
    });

    registerManualOption({
        handlers,
        key: "cacheRoot",
        option: cacheOption,
        configure: (option) => configurePathOption(command, option)
    });

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
