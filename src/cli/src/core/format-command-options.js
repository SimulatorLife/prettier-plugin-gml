import { asArray, getNonEmptyTrimmedString } from "../shared/dependencies.js";
import { normalizeExtensions } from "./extension-normalizer.js";

function resolveFormatCommandExtensions(options, defaultExtensions) {
    const fallback = asArray(defaultExtensions);
    const raw = options?.extensions;

    if (raw == null) {
        return fallback;
    }

    return normalizeExtensions(raw, fallback);
}

function resolveFormatCommandSampleLimits(options) {
    const source = options ?? {};
    return {
        skippedDirectorySampleLimit:
            source.ignoredDirectorySamples ??
            source.ignoredDirectorySampleLimit,
        ignoredFileSampleLimit: source.ignoredFileSampleLimit,
        unsupportedExtensionSampleLimit: source.unsupportedExtensionSampleLimit
    };
}

function resolvePrettierConfiguration(
    options,
    { defaultParseErrorAction, defaultPrettierLogLevel }
) {
    const source = options ?? {};
    return {
        prettierLogLevel: source.logLevel ?? defaultPrettierLogLevel,
        onParseError: source.onParseError ?? defaultParseErrorAction,
        checkMode: Boolean(source.check)
    };
}

function resolveTargetPathInputs(options, args) {
    const positionalTarget = Array.isArray(args) ? args[0] : undefined;
    const rawTarget = options.path ?? positionalTarget ?? null;

    const targetPathInput =
        typeof rawTarget === "string"
            ? getNonEmptyTrimmedString(rawTarget)
            : (rawTarget ?? null);
    const targetPathProvided = rawTarget != null;
    const rawTargetPathInput =
        typeof rawTarget === "string" &&
        targetPathInput !== null &&
        targetPathInput !== rawTarget
            ? rawTarget
            : undefined;

    return { targetPathInput, targetPathProvided, rawTargetPathInput };
}

export function collectFormatCommandOptions(
    command,
    {
        defaultExtensions = [],
        defaultParseErrorAction,
        defaultPrettierLogLevel
    } = {}
) {
    const options = command?.opts?.() ?? {};
    const { targetPathInput, targetPathProvided, rawTargetPathInput } =
        resolveTargetPathInputs(options, command?.args);

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
