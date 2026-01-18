import { Core } from "@gml-modules/core";

import type { CommanderCommandLike } from "./commander-types.js";
import { normalizeExtensions } from "./extension-normalizer.js";

const { getNonEmptyTrimmedString } = Core;

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

interface TargetPathResolution {
    targetPathInput: unknown;
    targetPathProvided: boolean;
    rawTargetPathInput?: string;
}

export interface CollectFormatCommandOptionsParameters {
    defaultExtensions?: ReadonlyArray<string>;
    defaultParseErrorAction?: string;
    defaultPrettierLogLevel?: string;
}

export interface FormatCommandOptionsResult extends FormatCommandSampleLimits, ResolvedPrettierConfiguration {
    targetPathInput: unknown;
    targetPathProvided: boolean;
    extensions: Array<string>;
    rawTargetPathInput?: string;
    usage: string;
}

type CommandOptionsRecord = Record<string, unknown>;

function resolveFormatCommandExtensions(
    options: CommandOptionsRecord,
    defaultExtensions: ReadonlyArray<string>
): Array<string> {
    const fallback = Array.from(defaultExtensions);
    const raw = options?.extensions;

    if (raw == null) {
        return fallback;
    }

    return normalizeExtensions(raw as string | Iterable<string> | null | undefined, fallback);
}

function resolveFormatCommandSampleLimits(options: CommandOptionsRecord): FormatCommandSampleLimits {
    const source = options ?? {};
    const skipped = source.ignoredDirectorySamples ?? source.ignoredDirectorySampleLimit ?? undefined;
    return {
        skippedDirectorySampleLimit: skipped as number | undefined,
        ignoredFileSampleLimit: (source.ignoredFileSampleLimit as number | undefined) ?? undefined,
        unsupportedExtensionSampleLimit: (source.unsupportedExtensionSampleLimit as number | undefined) ?? undefined
    };
}

function resolvePrettierConfiguration(
    options: CommandOptionsRecord,
    { defaultParseErrorAction, defaultPrettierLogLevel }: PrettierConfigurationOptions
): ResolvedPrettierConfiguration {
    const source = options ?? {};
    return {
        prettierLogLevel: (source.logLevel as string) ?? defaultPrettierLogLevel,
        onParseError: (source.onParseError as string) ?? defaultParseErrorAction,
        checkMode: Boolean(source.check)
    };
}

function getFirstPositionalArgument(args: Array<unknown>): unknown {
    if (args.length > 0) {
        return args[0];
    }

    return null;
}

function resolveTargetPathInput(options: CommandOptionsRecord, args: Array<unknown>): TargetPathResolution {
    const positionalTarget = getFirstPositionalArgument(args);
    const rawTarget = options.path ?? positionalTarget ?? null;

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

    return { targetPathInput, targetPathProvided, rawTargetPathInput };
}

export function collectFormatCommandOptions(
    command: CommanderCommandLike,
    {
        defaultExtensions = [],
        defaultParseErrorAction,
        defaultPrettierLogLevel
    }: CollectFormatCommandOptionsParameters = {}
): FormatCommandOptionsResult {
    const options = (command?.opts?.() ?? {}) as CommandOptionsRecord;
    const args = Core.toMutableArray(command?.args, { clone: true });
    const { targetPathInput, targetPathProvided, rawTargetPathInput } = resolveTargetPathInput(options, args);

    const { skippedDirectorySampleLimit, ignoredFileSampleLimit, unsupportedExtensionSampleLimit } =
        resolveFormatCommandSampleLimits(options);
    const { prettierLogLevel, onParseError, checkMode } = resolvePrettierConfiguration(options, {
        defaultParseErrorAction,
        defaultPrettierLogLevel
    });

    const usage = typeof command?.helpInformation === "function" ? command.helpInformation() : "";

    const defaultExtensionList = Array.from(defaultExtensions);

    return {
        targetPathInput,
        targetPathProvided,
        extensions: resolveFormatCommandExtensions(options, defaultExtensionList),
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
