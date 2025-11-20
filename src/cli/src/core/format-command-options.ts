import type { Command } from "commander";

import { asArray, getNonEmptyTrimmedString } from "../shared/dependencies.js";
import { normalizeExtensions } from "./extension-normalizer.js";

interface FormatCommandSampleLimits {
    skippedDirectorySampleLimit?: number;
    ignoredFileSampleLimit?: number;
    unsupportedExtensionSampleLimit?: number;
}

interface PrettierConfigurationOptions {
    defaultParseErrorAction?: string;
    defaultPrettierLogLevel?: string;
}

interface ResolvedPrettierConfiguration {
    prettierLogLevel?: string;
    onParseError?: string;
    checkMode: boolean;
}

export interface CollectFormatCommandOptionsParameters {
    defaultExtensions?: Array<string>;
    defaultParseErrorAction?: string;
    defaultPrettierLogLevel?: string;
}

export interface FormatCommandOptionsResult
    extends FormatCommandSampleLimits,
        ResolvedPrettierConfiguration {
    targetPathInput: unknown;
    targetPathProvided: boolean;
    extensions: Array<string>;
    rawTargetPathInput?: string;
    usage: string;
}

type CommandOptionsRecord = Record<string, unknown>;

function resolveFormatCommandExtensions(
    options: CommandOptionsRecord,
    defaultExtensions: Array<string>
): Array<string> {
    const fallback = asArray(defaultExtensions);
    const raw = options?.extensions;

    if (raw == null) {
        return fallback;
    }

    return normalizeExtensions(
        raw as string | Iterable<string> | null | undefined,
        fallback
    );
}

function resolveFormatCommandSampleLimits(
    options: CommandOptionsRecord
): FormatCommandSampleLimits {
    const source = options ?? {};
    const skipped =
        (source.ignoredDirectorySamples ??
            source.ignoredDirectorySampleLimit) ?? undefined;
    return {
        skippedDirectorySampleLimit: skipped as number | undefined,
        ignoredFileSampleLimit:
            (source.ignoredFileSampleLimit as number | undefined) ?? undefined,
        unsupportedExtensionSampleLimit:
            (source.unsupportedExtensionSampleLimit as number | undefined) ??
            undefined
    };
}

function resolvePrettierConfiguration(
    options: CommandOptionsRecord,
    { defaultParseErrorAction, defaultPrettierLogLevel }: PrettierConfigurationOptions
): ResolvedPrettierConfiguration {
    const source = options ?? {};
    return {
        prettierLogLevel: (source.logLevel as string) ?? defaultPrettierLogLevel,
        onParseError:
            (source.onParseError as string) ?? defaultParseErrorAction,
        checkMode: Boolean(source.check)
    };
}

export function collectFormatCommandOptions(
    command: Command,
    {
        defaultExtensions = [],
        defaultParseErrorAction,
        defaultPrettierLogLevel
    }: CollectFormatCommandOptionsParameters = {}
): FormatCommandOptionsResult {
    const options = (command?.opts?.() ?? {}) as CommandOptionsRecord;
    const args = Array.isArray(command?.args) ? command.args : [];
    const positionalTarget = args.length > 0 ? args[0] : null;
    const rawTarget =
        (options.path as unknown) ?? positionalTarget ?? null;

    let targetPathInput: unknown = null;
    let targetPathProvided = false;
    let rawTargetPathInput: string | undefined;

    if (typeof rawTarget === "string") {
        const trimmedTarget = getNonEmptyTrimmedString(rawTarget);
        targetPathInput = trimmedTarget ?? null;
        targetPathProvided = true;

        if (trimmedTarget !== null && trimmedTarget !== rawTarget) {
            rawTargetPathInput = rawTarget;
        }
    } else if (rawTarget !== null) {
        targetPathInput = rawTarget;
        targetPathProvided = true;
    }

    const {
        skippedDirectorySampleLimit,
        ignoredFileSampleLimit,
        unsupportedExtensionSampleLimit
    } = resolveFormatCommandSampleLimits(options);
    const { prettierLogLevel, onParseError, checkMode } =
        resolvePrettierConfiguration(options, {
            defaultParseErrorAction,
            defaultPrettierLogLevel
        });

    const usage =
        typeof command?.helpInformation === "function"
            ? command.helpInformation()
            : "";

    return {
        targetPathInput,
        targetPathProvided,
        extensions: resolveFormatCommandExtensions(options, defaultExtensions),
        prettierLogLevel,
        onParseError,
        checkMode,
        rawTargetPathInput,
        skippedDirectorySampleLimit,
        ignoredFileSampleLimit,
        unsupportedExtensionSampleLimit,
        usage
    };
}
