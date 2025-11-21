import {
    assertFunction,
    resolveIntegerOption,
    createEnvConfiguredValue
} from "../shared/dependencies.js";

type IntegerCoercer = (
    value: unknown,
    context: Record<string, unknown>
) => number;

export interface IntegerOptionToolkitOptions {
    defaultValue?: number;
    envVar?: string;
    baseCoerce: IntegerCoercer;
    createErrorMessage?: string | ((value: unknown) => string);
    typeErrorMessage?: string | ((type: string) => string);
    blankStringReturnsDefault?: boolean;
    transform?: (value: number | null | undefined) => number | null | undefined;
    optionAlias?: string;
}

export interface IntegerOptionToolkit {
    getDefault: () => number | undefined;
    setDefault: (value?: unknown) => number | undefined;
    applyEnvOverride: (env?: NodeJS.ProcessEnv) => number | undefined;
    resolve: (
        value?: unknown,
        options?: Record<string, unknown> & { defaultValue?: number }
    ) => number | null | undefined;
}

export function createIntegerOptionToolkit({
    defaultValue,
    envVar,
    baseCoerce,
    createErrorMessage,
    typeErrorMessage,
    blankStringReturnsDefault,
    transform,
    optionAlias
}: IntegerOptionToolkitOptions): IntegerOptionToolkit {
    assertFunction(baseCoerce, "baseCoerce");

    const coerce: IntegerCoercer = (value, context = {}) => {
        const opts =
            createErrorMessage && !context.createErrorMessage
                ? { ...context, createErrorMessage }
                : context;
        return baseCoerce(value, opts);
    };

    const state = createEnvConfiguredValue<number | undefined>({
        defaultValue,
        envVar,
        normalize: (value, { defaultValue: baseline, previousValue }) => {
            return resolveIntegerOption(value, {
                defaultValue: baseline ?? previousValue,
                coerce,
                typeErrorMessage,
                blankStringReturnsDefault
            });
        }
    });

    function resolve(
        rawValue?: unknown,
        options: Record<string, unknown> & { defaultValue?: number } = {}
    ) {
        let opts = options;

        if (optionAlias && options?.[optionAlias] !== undefined) {
            opts = { ...options, defaultValue: options[optionAlias] as number };
            delete opts[optionAlias];
        }

        const fallback = opts.defaultValue ?? state.get();
        const normalized = resolveIntegerOption(rawValue, {
            defaultValue: fallback,
            coerce,
            typeErrorMessage,
            blankStringReturnsDefault
        });

        return transform ? transform(normalized) : normalized;
    }

    const toolkit: IntegerOptionToolkit = {
        getDefault: state.get,
        setDefault: (value) => state.set(value),
        applyEnvOverride: state.applyEnvOverride,
        resolve
    };

    return toolkit;
}
