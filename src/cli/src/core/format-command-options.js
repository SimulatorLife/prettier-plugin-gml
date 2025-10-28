import {
    getNonEmptyTrimmedString,
    isNonEmptyArray
} from "../shared/dependencies.js";

function normalizeTargetPathInput(rawInput) {
    if (typeof rawInput === "string") {
        const trimmed = getNonEmptyTrimmedString(rawInput);
        return {
            targetPathInput: trimmed ?? null,
            targetPathProvided: true
        };
    }

    const normalized = rawInput ?? null;
    return {
        targetPathInput: normalized,
        targetPathProvided: normalized !== null
    };
}

function extractPositionalTarget(command) {
    const args = command?.args;
    if (!isNonEmptyArray(args)) {
        return null;
    }

    return args[0];
}

function resolveTargetPathCandidate(command, options) {
    const source = options ?? {};
    return source.path ?? extractPositionalTarget(command) ?? null;
}

function resolveTargetPathInputs(command, options) {
    return normalizeTargetPathInput(
        resolveTargetPathCandidate(command, options)
    );
}

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
    const { targetPathInput, targetPathProvided } = resolveTargetPathInputs(
        command,
        options
    );
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

export { normalizeTargetPathInput, resolveTargetPathInputs };
