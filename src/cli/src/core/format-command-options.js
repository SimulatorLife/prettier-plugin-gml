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

export function collectFormatCommandOptions(
    command,
    {
        defaultExtensions = [],
        defaultParseErrorAction,
        defaultPrettierLogLevel
    } = {}
) {
    const options = command?.opts?.() ?? {};
    const args = Array.isArray(command?.args) ? command.args : [];
    const positionalTarget = args.length > 0 ? args[0] : null;
    const rawTarget = options.path ?? positionalTarget ?? null;

    let targetPathInput = null;
    let targetPathProvided = false;
    let rawTargetPathInput;

    if (typeof rawTarget === "string") {
        const trimmedTarget = getNonEmptyTrimmedString(rawTarget);
        targetPathInput = trimmedTarget ?? null;
        targetPathProvided = true;

        if (trimmedTarget !== null && trimmedTarget !== rawTarget) {
            rawTargetPathInput = rawTarget;
        }
    } else if (rawTarget != null) {
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
