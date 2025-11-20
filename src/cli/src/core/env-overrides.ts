import type { Command } from "commander";

import { CliUsageError } from "./errors.js";
import {
    assertArray,
    isNonEmptyString,
    isObjectLike,
    isErrorLike
} from "../shared/dependencies.js";

const DEFAULT_SOURCE = "env";

type UsageResolver = (() => string) | string | null | undefined;

interface EnvOptionOverride {
    envVar: string;
    optionName: string;
    resolveValue?: (value: string) => unknown;
    source?: string;
    getUsage?: UsageResolver;
}

interface ApplyEnvOverridesOptions {
    command: Command;
    env?: NodeJS.ProcessEnv;
    overrides: Array<EnvOptionOverride>;
    getUsage?: UsageResolver;
}

/**
 * Normalize a usage helper into a string Commander can surface when reporting
 * environment override failures. Accepts lazily-evaluated callbacks so callers
 * can defer expensive usage generation until diagnostics are actually needed.
 *
 * @param {(() => string) | string | null | undefined} getUsage Usage provider
 *        supplied by the caller.
 * @returns {string | null} Materialized usage text, or `null` when none was
 *          supplied.
 */
function resolveUsage(getUsage: UsageResolver): string | null {
    if (typeof getUsage === "function") {
        return getUsage();
    }

    return getUsage ?? null;
}

/**
 * Convert arbitrary resolver errors into a {@link CliUsageError} with an
 * optional usage hint. The helper centralizes the message fallback and cause
 * wiring so individual overrides can focus on validating values without
 * repeating defensive plumbing.
 *
 * @param {object} parameters
 * @param {unknown} parameters.error Failure thrown by the override resolver.
 * @param {string | undefined} parameters.envVar Environment variable backing
 *        the override. Used to build the default error message when the cause
 *        does not supply one.
 * @param {(() => string) | string | null | undefined} parameters.getUsage
 *        Lazy usage provider forwarded to {@link CliUsageError}.
 * @returns {CliUsageError} Configured usage error with the original cause
 *          attached when available.
 */
function createOverrideError({
    error,
    envVar,
    getUsage
}: {
    error: unknown;
    envVar?: string;
    getUsage?: UsageResolver;
}): CliUsageError {
    const usage = resolveUsage(getUsage);
    const fallbackMessage = envVar
        ? `Invalid value provided for ${envVar}.`
        : "Invalid environment variable value provided.";
    const message =
        isErrorLike(error) &&
        isNonEmptyString(error.message) &&
        !/^error\b/i.test(error.message.trim())
            ? error.message
            : fallbackMessage;

    const cliError = new CliUsageError(message, { usage });
    cliError.cause = isErrorLike(error) ? error : undefined;
    return cliError;
}

/**
 * Apply an environment-driven override to a Commander option.
 *
 * Normalizes optional hooks and error handling so individual overrides can
 * focus on the mapping logic instead of defensive plumbing.
 *
 * @param {object} parameters
 * @param {import("commander").Command} parameters.command Command receiving
 *                                                          the override.
 * @param {NodeJS.ProcessEnv | undefined} parameters.env Environment variables
 *                                                       to read from.
 * @param {string} parameters.envVar Environment variable powering the
 *                                   override.
 * @param {string} parameters.optionName Commander option to update.
 * @param {(value: string) => unknown} [parameters.resolveValue] Mapper invoked
 *        before the option is set.
 * @param {string} [parameters.source="env"] Source label forwarded to
 *        Commander.
 * @param {(() => string) | string | null} [parameters.getUsage] Optional usage
 *        helper displayed when validation fails.
 */
export function applyEnvOptionOverride({
    command,
    env,
    envVar,
    optionName,
    resolveValue,
    source = DEFAULT_SOURCE,
    getUsage
}: EnvOptionOverride & { command: Command; env?: NodeJS.ProcessEnv }): void {
    if (!command || typeof command.setOptionValueWithSource !== "function") {
        // Ignore overrides when the target command is missing or lacks the
        // Commander API for setting option values. Downstream callers already
        // guard most entry points, but tolerating unexpected inputs keeps the
        // helper resilient in shared utilities and tests.
        return;
    }

    const rawValue = env?.[envVar];
    if (rawValue === undefined) {
        return;
    }

    const resolver =
        typeof resolveValue === "function" ? resolveValue : (value) => value;

    try {
        const resolved = resolver(rawValue);
        command.setOptionValueWithSource(optionName, resolved, source);
    } catch (error) {
        throw createOverrideError({ error, envVar, getUsage });
    }
}

/**
 * Apply multiple environment-driven overrides with shared error handling.
 *
 * Reduces repetition when commands expose several environment variables that
 * need to map onto commander options by centralizing the iteration and
 * fallback usage wiring.
 *
 * @param {object} parameters
 * @param {import("commander").Command} parameters.command Command receiving
 *                                                          the overrides.
 * @param {NodeJS.ProcessEnv | undefined} parameters.env Environment variables
 *                                                       to read from.
 * @param {Array<object>} parameters.overrides Override descriptors forwarded to
 *                                             {@link applyEnvOptionOverride}.
 * @param {(() => string) | string | null} [parameters.getUsage] Usage provider
 *                                                             used when an
 *                                                             override fails
 *                                                             without its own.
 */
export function applyEnvOptionOverrides({
    command,
    env,
    overrides,
    getUsage
}: ApplyEnvOverridesOptions): void {
    const overrideEntries = assertArray(overrides, {
        name: "overrides",
        errorMessage: "overrides must be provided as an array"
    });

    for (const override of overrideEntries) {
        if (!isObjectLike(override)) {
            continue;
        }

        const { getUsage: overrideGetUsage, ...options } = override;

        applyEnvOptionOverride({
            command,
            env,
            getUsage: overrideGetUsage ?? getUsage,
            ...options
        });
    }
}
