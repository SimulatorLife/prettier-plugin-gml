import { Core } from "@gml-modules/core";

const {
    coerceNonNegativeInteger,
    describeValueForError,
    resolveIntegerOption
} = Core;

interface SampleLimitOptionParams {
    defaultValue?: number;
    envVar?: string;
    subjectLabel?: string;
}

export interface SampleLimitRuntimeOption {
    defaultValue?: number;
    envVar?: string;
    getDefault: () => number | undefined;
    setDefault: (value?: unknown) => number | undefined;
    resolve: (
        value?: unknown,
        options?: { defaultLimit?: number; defaultValue?: number }
    ) => number | null | undefined;
    applyEnvOverride: (env?: NodeJS.ProcessEnv) => number | undefined;
}

export function createSampleLimitRuntimeOption(
    params: SampleLimitOptionParams,
    { env }: { env?: NodeJS.ProcessEnv } = {}
): SampleLimitRuntimeOption {
    const { defaultValue, envVar, subjectLabel = "Sample" } = params;

    let currentDefault = defaultValue;

    const coerce = (val: unknown) =>
        coerceNonNegativeInteger(val, {
            createErrorMessage: (received: unknown) =>
                `${subjectLabel} sample limit must be a non-negative integer (received ${describeValueForError(received)}). Provide 0 to suppress the sample list.`
        });

    const typeErrorMessage = (type: string) =>
        `${subjectLabel} sample limit must be provided as a number (received type '${type}').`;

    const getDefault = () => currentDefault;

    const setDefault = (value?: unknown) => {
        currentDefault =
            value === undefined
                ? defaultValue
                : resolveValue(value, { defaultValue });
        return currentDefault;
    };

    const applyEnvOverride = (overrideEnv?: NodeJS.ProcessEnv) => {
        const targetEnv = overrideEnv ?? env;
        if (envVar && targetEnv?.[envVar]) {
            currentDefault = resolveValue(targetEnv[envVar], { defaultValue });
        }
        return currentDefault;
    };

    const resolveValue = (
        value: unknown,
        options: { defaultValue?: number } = {}
    ) =>
        resolveIntegerOption(value, {
            defaultValue: options.defaultValue ?? currentDefault,
            coerce,
            typeErrorMessage
        });

    const resolve = (
        value?: unknown,
        options: { defaultLimit?: number; defaultValue?: number } = {}
    ) => {
        const fallback = options.defaultLimit ?? options.defaultValue;
        return resolveValue(value, {
            defaultValue: fallback ?? currentDefault
        });
    };

    applyEnvOverride();

    return Object.freeze({
        defaultValue,
        envVar,
        getDefault,
        setDefault,
        resolve,
        applyEnvOverride
    });
}
