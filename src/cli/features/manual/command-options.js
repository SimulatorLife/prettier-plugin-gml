import path from "node:path";
import process from "node:process";

import { wrapInvalidArgumentResolver } from "../../core/command-parsing.js";
import {
    DEFAULT_MANUAL_REPO,
    createManualVerboseState,
    resolveManualRepoValue
} from "./utils.js";
import {
    getDefaultProgressBarWidth,
    resolveProgressBarWidth
} from "../../shared/progress-bar.js";
import {
    assertFunction,
    hasOwn,
    isNonEmptyString
} from "../../shared/dependencies.js";

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
const DEFAULT_PATH_NORMALIZER = (value) => path.resolve(value);

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

    if (customOptions && typeof customOptions === "object") {
        for (const [key, handler] of Object.entries(customOptions)) {
            if (typeof handler === "function") {
                handlers.set(key, () => handler(command));
            }
        }
    }

    const registerBuiltInHandler = (key, handler) => {
        if (typeof handler === "function") {
            handlers.set(key, handler);
        }
    };

    registerBuiltInHandler(
        "outputPath",
        outputOption && (() => configurePathOption(command, outputOption))
    );

    if (forceRefreshDescription !== false) {
        registerBuiltInHandler("forceRefresh", () =>
            command.option("--force-refresh", forceRefreshDescription)
        );
    }

    if (quietDescription !== false) {
        registerBuiltInHandler("quiet", () =>
            command.option("--quiet", quietDescription)
        );
    }

    registerBuiltInHandler(
        "progressBarWidth",
        progressOption &&
            (() =>
                configureResolvedOption({
                    command,
                    option: progressOption,
                    fallbackResolve: resolveProgressBarWidth,
                    resolverName: "progressBarWidth.resolve"
                }))
    );

    registerBuiltInHandler(
        "manualRepo",
        manualRepoOption &&
            (() =>
                configureResolvedOption({
                    command,
                    option: manualRepoOption,
                    fallbackResolve: resolveManualRepoValue,
                    resolverName: "manualRepo.resolve"
                }))
    );

    registerBuiltInHandler(
        "cacheRoot",
        cacheOption && (() => configurePathOption(command, cacheOption))
    );

    const preferredOrder = Array.isArray(optionOrder) ? optionOrder : [];
    const ordering = new Set([
        ...preferredOrder,
        ...DEFAULT_OPTION_ORDER,
        ...handlers.keys()
    ]);

    for (const key of ordering) {
        handlers.get(key)?.();
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
