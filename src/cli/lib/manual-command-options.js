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
import { hasOwn } from "./shared/object-utils.js";

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
    const description =
        typeof config.description === "string" && config.description.length > 0
            ? config.description
            : describe(defaultValue);

    return {
        config,
        flag: config.flag ?? flag,
        defaultValue,
        description
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

    const registeredKeys = new Set([
        ...handlers.keys(),
        ...customHandlers.keys()
    ]);

    const preferredOrder = Array.isArray(optionOrder) ? optionOrder : [];
    const orderingCandidates = [
        ...preferredOrder,
        ...defaultOrder,
        ...customHandlers.keys()
    ];

    const seen = new Set();
    const sequence = [];

    for (const key of orderingCandidates) {
        if (seen.has(key) || !registeredKeys.has(key)) {
            continue;
        }

        seen.add(key);
        sequence.push(key);
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

    if (outputOption) {
        const normalize =
            typeof outputOption.config.normalize === "function"
                ? outputOption.config.normalize
                : (value) => path.resolve(value);

        handlers.set("outputPath", () =>
            command.option(
                outputOption.flag,
                outputOption.description,
                normalize,
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
        const resolveFn =
            typeof progressOption.config.resolve === "function"
                ? progressOption.config.resolve
                : resolveProgressBarWidth;

        if (typeof resolveFn !== "function") {
            throw new TypeError("progressBarWidth.resolve must be a function.");
        }

        handlers.set("progressBarWidth", () =>
            command.option(
                progressOption.flag,
                progressOption.description,
                wrapInvalidArgumentResolver(resolveFn),
                progressOption.defaultValue
            )
        );
    }

    if (manualRepoOption) {
        const resolveFn =
            typeof manualRepoOption.config.resolve === "function"
                ? manualRepoOption.config.resolve
                : resolveManualRepoValue;

        if (typeof resolveFn !== "function") {
            throw new TypeError("manualRepo.resolve must be a function.");
        }

        handlers.set("manualRepo", () =>
            command.option(
                manualRepoOption.flag,
                manualRepoOption.description,
                wrapInvalidArgumentResolver(resolveFn),
                manualRepoOption.defaultValue
            )
        );
    }

    if (cacheOption) {
        const normalize =
            typeof cacheOption.config.normalize === "function"
                ? cacheOption.config.normalize
                : (value) => path.resolve(value);

        handlers.set("cacheRoot", () =>
            command.option(
                cacheOption.flag,
                cacheOption.description,
                normalize,
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
