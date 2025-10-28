import { getNonEmptyTrimmedString } from "../shared/dependencies.js";

function resolveFormatCommandExtensions(options, defaultExtensions) {
    const source = options ?? {};
    const fallback = Array.isArray(defaultExtensions) ? defaultExtensions : [];
    const rawExtensions = source.extensions ?? fallback;

    if (Array.isArray(rawExtensions)) {
        return rawExtensions;
    }

    if (typeof rawExtensions === "string") {
        return [rawExtensions];
    }

    return [...(rawExtensions ?? fallback)];
}

function resolveFormatCommandSampleLimits(options) {
    const source = options ?? {};
    return {
        skippedDirectorySampleLimit:
            source.ignoredDirectorySampleLimit ??
            source.ignoredDirectorySamples,
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

    if (typeof rawTarget === "string") {
        targetPathInput = getNonEmptyTrimmedString(rawTarget) ?? null;
        targetPathProvided = true;
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
        skippedDirectorySampleLimit,
        ignoredFileSampleLimit,
        unsupportedExtensionSampleLimit,
        usage
    };
}
