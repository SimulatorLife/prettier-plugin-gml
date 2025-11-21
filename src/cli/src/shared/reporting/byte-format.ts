import { Buffer } from "node:buffer";

import { isFiniteNumber } from "../dependencies.js";
import {
    callWithFallback,
    coercePositiveInteger,
    createNumericTypeErrorFormatter
} from "../dependencies.js";
import { createIntegerOptionToolkit } from "../../core/integer-option-toolkit.js";

const BYTE_UNITS = Object.freeze(["B", "KB", "MB", "GB", "TB", "PB"]);
const DEFAULT_BYTE_FORMAT_RADIX = 1024;
const BYTE_FORMAT_RADIX_ENV_VAR = "PRETTIER_PLUGIN_GML_BYTE_FORMAT_RADIX";

const createRadixErrorMessage = (received: unknown): string =>
    `Byte format radix must be a positive integer (received ${received}).`;

const createRadixTypeErrorMessage =
    createNumericTypeErrorFormatter("Byte format radix");

const byteFormatToolkit = createIntegerOptionToolkit({
    defaultValue: DEFAULT_BYTE_FORMAT_RADIX,
    envVar: BYTE_FORMAT_RADIX_ENV_VAR,
    baseCoerce: coercePositiveInteger,
    createErrorMessage: createRadixErrorMessage,
    typeErrorMessage: createRadixTypeErrorMessage,
    optionAlias: "defaultRadix"
});

const {
    getDefault: getDefaultByteFormatRadix,
    setDefault: setDefaultByteFormatRadix,
    resolve: resolveByteFormatRadix,
    applyEnvOverride: applyByteFormatRadixEnvOverride
} = byteFormatToolkit;

applyByteFormatRadixEnvOverride();

type NumericLike = number | bigint | unknown;

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

    return Math.max(numericValue, 0);
}

function resolveRadixOverride(
    radix: number | string | undefined,
    defaultRadix: number
): number {
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
    {
        decimals = 1,
        decimalsForBytes = 0,
        separator = "",
        trimTrailingZeros = false,
        radix
    }: FormatByteSizeOptions = {}
): string {
    let value = normalizeByteCount(bytes);
    const defaultRadix =
        getDefaultByteFormatRadix() ?? DEFAULT_BYTE_FORMAT_RADIX;
    const resolvedRadix = resolveRadixOverride(radix, defaultRadix);
    const maxUnitIndex = BYTE_UNITS.length - 1;
    let unitIndex = 0;

    for (; unitIndex < maxUnitIndex && value >= resolvedRadix; unitIndex += 1) {
        value /= resolvedRadix;
    }

    const decimalPlaces = Math.max(
        0,
        unitIndex === 0 ? decimalsForBytes : decimals
    );

    let formattedValue = value.toFixed(decimalPlaces);

    if (trimTrailingZeros && decimalPlaces > 0) {
        formattedValue = formattedValue.replace(
            /(?:\\.0+|(\\.\\d*?[1-9])0+)$/,
            "$1"
        );
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
