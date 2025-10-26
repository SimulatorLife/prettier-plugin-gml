import { Buffer } from "node:buffer";
import { isFiniteNumber } from "../../../shared/src/index.js";
import { coercePositiveInteger } from "../shared/dependencies.js";
import { createIntegerOptionToolkit } from "../core/integer-option-toolkit.js";

const BYTE_UNITS = Object.freeze(["B", "KB", "MB", "GB", "TB", "PB"]);
const DEFAULT_BYTE_FORMAT_RADIX = 1024;
const BYTE_FORMAT_RADIX_ENV_VAR = "PRETTIER_PLUGIN_GML_BYTE_FORMAT_RADIX";

const createRadixErrorMessage = (received) =>
    `Byte format radix must be a positive integer (received ${received}).`;

const createRadixTypeErrorMessage = (type) =>
    `Byte format radix must be provided as a number (received type '${type}').`;

const {
    getDefault: getDefaultByteFormatRadix,
    setDefault: setDefaultByteFormatRadix,
    resolve: resolveByteFormatRadix,
    applyEnvOverride: applyByteFormatRadixEnvOverride
} = createIntegerOptionToolkit({
    defaultValue: DEFAULT_BYTE_FORMAT_RADIX,
    envVar: BYTE_FORMAT_RADIX_ENV_VAR,
    baseCoerce: coercePositiveInteger,
    createErrorMessage: createRadixErrorMessage,
    typeErrorMessage: createRadixTypeErrorMessage,
    defaultValueOption: "defaultRadix"
});

applyByteFormatRadixEnvOverride();

function normalizeByteCount(value) {
    const numericValue = typeof value === "bigint" ? Number(value) : value;

    if (!isFiniteNumber(numericValue)) {
        return 0;
    }

    return Math.max(numericValue, 0);
}

function resolveRadixOverride(radix, defaultRadix) {
    if (radix === undefined) {
        return defaultRadix;
    }

    try {
        const resolved = resolveByteFormatRadix(radix, { defaultRadix });
        return typeof resolved === "number" ? resolved : defaultRadix;
    } catch {
        return defaultRadix;
    }
}

/**
 * Format a byte count using human-readable units. The helper previously lived
 * in the shared numeric utilities even though only CLI reporting paths relied
 * on it. Co-locating the formatter with the rest of the CLI byte helpers keeps
 * the shared bundle focused on cross-environment primitives while retaining
 * backwards-compatible behaviour for command modules.
 *
 * @param {number | bigint | unknown} bytes Amount of data to format.
 * @param {object} [options]
 * @param {number} [options.decimals=1] Decimal places for non-byte units.
 * @param {number} [options.decimalsForBytes=0] Decimal places when the value is below 1 KB.
 * @param {string} [options.separator=""] String inserted between the value and unit.
 * @param {boolean} [options.trimTrailingZeros=false] Remove insignificant zeros from the fractional part.
 * @param {number | string} [options.radix] Override for the unit scaling radix. Falls back to the configured default when invalid.
 * @returns {string} Human-readable representation of the byte size.
 */
function formatByteSize(
    bytes,
    {
        decimals = 1,
        decimalsForBytes = 0,
        separator = "",
        trimTrailingZeros = false,
        radix
    } = {}
) {
    let value = normalizeByteCount(bytes);
    const defaultRadix = getDefaultByteFormatRadix();
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
            /(?:\.0+|(\.\d*?[1-9])0+)$/,
            "$1"
        );
    }

    const unitSeparator = typeof separator === "string" ? separator : "";

    return `${formattedValue}${unitSeparator}${BYTE_UNITS[unitIndex]}`;
}

/**
 * Format UTF-8 text size using the CLI byte formatter. The helper previously
 * lived in the shared number utilities even though it relies on Node's
 * `Buffer` API, which is only available in the CLI/runtime tooling layer.
 * Co-locating it with the rest of the CLI byte helpers keeps the shared bundle
 * environment-agnostic while preserving the existing ergonomics for command
 * modules.
 *
 * @param {string} text Text to measure.
 * @returns {string} Human-readable byte size string.
 */
function formatBytes(text) {
    const size = Buffer.byteLength(text, "utf8");
    return formatByteSize(size, { decimals: 1 });
}

export {
    DEFAULT_BYTE_FORMAT_RADIX,
    BYTE_FORMAT_RADIX_ENV_VAR,
    applyByteFormatRadixEnvOverride,
    formatByteSize,
    formatBytes,
    getDefaultByteFormatRadix,
    resolveByteFormatRadix,
    setDefaultByteFormatRadix
};
