import { Buffer } from "node:buffer";

import { Core } from "@gml-modules/core";

const {
    callWithFallback,
    coercePositiveInteger,
    createEnvConfiguredValue,
    createNumericTypeErrorFormatter,
    describeValueForError,
    isFiniteNumber,
    resolveIntegerOption
} = Core;

const BYTE_UNITS = Object.freeze(["B", "KB", "MB", "GB", "TB", "PB"]);
const DEFAULT_BYTE_FORMAT_RADIX = 1024;
const BYTE_FORMAT_RADIX_ENV_VAR = "PRETTIER_PLUGIN_GML_BYTE_FORMAT_RADIX";

const createRadixErrorMessage = (received: unknown): string =>
    `Byte format radix must be a positive integer (received ${describeValueForError(received)}).`;

const createRadixTypeErrorMessage = createNumericTypeErrorFormatter("Byte format radix");

const coerce = (value: unknown, context = {}) => {
    const opts = { ...context, createErrorMessage: createRadixErrorMessage };
    return coercePositiveInteger(value, opts);
};

const state = createEnvConfiguredValue<number | undefined>({
    defaultValue: DEFAULT_BYTE_FORMAT_RADIX,
    envVar: BYTE_FORMAT_RADIX_ENV_VAR,
    normalize: (value, { defaultValue: baseline, previousValue }) => {
        return resolveIntegerOption(value, {
            defaultValue: baseline ?? previousValue,
            coerce,
            typeErrorMessage: createRadixTypeErrorMessage,
            blankStringReturnsDefault: true
        });
    }
});

function getDefaultByteFormatRadix(): number | undefined {
    return state.get();
}

function setDefaultByteFormatRadix(value?: unknown): number | undefined {
    return state.set(value);
}

function resolveByteFormatRadix(
    rawValue?: unknown,
    options: Record<string, unknown> & {
        defaultValue?: number;
        defaultRadix?: number;
    } = {}
): number | null | undefined {
    const fallback = options.defaultRadix ?? options.defaultValue ?? state.get();
    return resolveIntegerOption(rawValue, {
        defaultValue: fallback,
        coerce,
        typeErrorMessage: createRadixTypeErrorMessage,
        blankStringReturnsDefault: true
    });
}

function applyByteFormatRadixEnvOverride(env?: NodeJS.ProcessEnv): number | undefined {
    return state.applyEnvOverride(env);
}

applyByteFormatRadixEnvOverride();

type NumericLike = number | bigint;

export interface FormatByteSizeOptions {
    decimals?: number;
    decimalsForBytes?: number;
    separator?: string;
    trimTrailingZeros?: boolean;
    radix?: number | string;
}

function normalizeByteCount(value: NumericLike): number {
    const numericValue = typeof value === "bigint" ? Number(value) : value;

    if (!isFiniteNumber(numericValue)) {
        return 0;
    }

    const normalizedValue = typeof numericValue === "number" ? numericValue : Number(numericValue);

    return Math.max(normalizedValue, 0);
}

function resolveRadixOverride(radix: number | string | undefined, defaultRadix: number): number {
    if (radix === undefined) {
        return defaultRadix;
    }

    return callWithFallback(
        () => {
            const resolved = resolveByteFormatRadix(radix, { defaultRadix });
            return typeof resolved === "number" ? resolved : defaultRadix;
        },
        { fallback: defaultRadix }
    );
}

function formatByteSize(
    bytes: NumericLike,
    { decimals = 1, decimalsForBytes = 0, separator = "", trimTrailingZeros = false, radix }: FormatByteSizeOptions = {}
): string {
    let value = normalizeByteCount(bytes);
    const defaultRadix = getDefaultByteFormatRadix() ?? DEFAULT_BYTE_FORMAT_RADIX;
    const resolvedRadix = resolveRadixOverride(radix, defaultRadix);
    const maxUnitIndex = BYTE_UNITS.length - 1;
    let unitIndex = 0;

    for (; unitIndex < maxUnitIndex && value >= resolvedRadix; unitIndex += 1) {
        value /= resolvedRadix;
    }

    const decimalPlaces = Math.max(0, unitIndex === 0 ? decimalsForBytes : decimals);

    let formattedValue = value.toFixed(decimalPlaces);

    if (trimTrailingZeros && decimalPlaces > 0) {
        formattedValue = formattedValue.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, "$1");
    }

    const unitSeparator = typeof separator === "string" ? separator : "";

    return `${formattedValue}${unitSeparator}${BYTE_UNITS[unitIndex]}`;
}

function formatBytes(text: string): string {
    const size = Buffer.byteLength(text, "utf8");
    return formatByteSize(size, { decimals: 1 });
}

export {
    BYTE_FORMAT_RADIX_ENV_VAR,
    DEFAULT_BYTE_FORMAT_RADIX,
    applyByteFormatRadixEnvOverride,
    formatByteSize,
    formatBytes,
    getDefaultByteFormatRadix,
    resolveByteFormatRadix,
    setDefaultByteFormatRadix
};
