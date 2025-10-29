import {
    asArray,
    getNonEmptyTrimmedString,
    toArrayFromIterable
} from "../shared/dependencies.js";

function resolveFormatCommandExtensions(options, defaultExtensions) {
    const fallback = asArray(defaultExtensions);
    const raw = options?.extensions;

    if (Array.isArray(raw)) {
        return raw;
    }

    if (typeof raw === "string") {
        return [raw];
    }

    if (raw == null) {
        return fallback;
    }

    if (typeof raw[Symbol.iterator] === "function") {
        return toArrayFromIterable(raw);
    }

    return fallback;
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
