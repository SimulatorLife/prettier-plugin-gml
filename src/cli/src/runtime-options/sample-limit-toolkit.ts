import {
    coerceNonNegativeInteger,
    resolveIntegerOption,
    createEnvConfiguredValue
} from "../dependencies.js";

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

function createSampleLimitOption({
    defaultValue,
    envVar,
    subjectLabel
}: SampleLimitOptionParams) {
    const label = subjectLabel ?? "Sample";

    const formatReceivedValue = (value: unknown): string => {
        if (value === null) {
            return "null";
        }
        if (value === undefined) {
            return "undefined";
        }

        const firstClass =
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            typeof value === "bigint";
        if (firstClass) {
            return String(value);
        }

        try {
            return JSON.stringify(value);
        } catch {
            return "[unknown]";
        }
    };

    const createErrorMessage = (received: unknown) =>
        `${label} sample limit must be a non-negative integer (received ${formatReceivedValue(
            received
        )}). Provide 0 to suppress the sample list.`;

    const createTypeError = (type: string) =>
        `${label} sample limit must be provided as a number (received type '${type}').`;

    const coerce = (value: unknown, context: Record<string, unknown>): number =>
        coerceNonNegativeInteger(value, { ...context, createErrorMessage });

    const state = createEnvConfiguredValue<number | undefined>({
        defaultValue,
        envVar,
        normalize: (value, { defaultValue: baseline, previousValue }) => {
            const fallback = baseline ?? previousValue;
            return resolveIntegerOption(value, {
                defaultValue: fallback,
                coerce,
                typeErrorMessage: createTypeError
            });
        }
    });

    function resolve(
        rawValue?: unknown,
        options: { defaultLimit?: number; defaultValue?: number } = {}
    ) {
        const defaultLimit = options.defaultLimit ?? options.defaultValue;
        const fallback =
            defaultLimit === undefined ? state.get() : defaultLimit;
        return resolveIntegerOption(rawValue, {
            defaultValue: fallback,
            coerce,
            typeErrorMessage: createTypeError
        });
    }

    return {
        getDefault: state.get,
        setDefault: (value) => state.set(value),
        resolve,
        applyEnvOverride: state.applyEnvOverride
    };
}

export function createSampleLimitRuntimeOption(
    params: SampleLimitOptionParams,
    { env }: { env?: NodeJS.ProcessEnv } = {}
): SampleLimitRuntimeOption {
    const { defaultValue, envVar } = params;
    const option = createSampleLimitOption(params);

    const applyEnvOverride = (overrideEnv?: NodeJS.ProcessEnv) =>
        option.applyEnvOverride(overrideEnv ?? env);

    applyEnvOverride();

    return Object.freeze({
        defaultValue,
        envVar,
        getDefault: option.getDefault,
        setDefault: option.setDefault,
        resolve: option.resolve,
        applyEnvOverride
    });
}
