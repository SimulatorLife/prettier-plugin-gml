import { Buffer } from "node:buffer";

const BYTE_UNITS = Object.freeze(["B", "KB", "MB", "GB", "TB", "PB"]);
const BYTE_RADIX = 1024;

function normalizeByteCount(value) {
    const numericValue = typeof value === "bigint" ? Number(value) : value;

    if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
        return 0;
    }

    return Math.max(numericValue, 0);
}

/**
 * Format a byte count using human-readable units. The helper previously lived
 * in the shared numeric utilities even though only CLI reporting paths relied
 * on it. Co-locating the formatter with the rest of the CLI byte helpers keeps
 * the shared bundle focused on cross-environment primitives while retaining
 * backwards-compatible behaviour for command modules.
 *
 * @param {number | bigint | unknown} bytes Amount of data to format.
 * @param {Object} [options]
 * @param {number} [options.decimals=1] Decimal places for non-byte units.
 * @param {number} [options.decimalsForBytes=0] Decimal places when the value is below 1 KB.
 * @param {string} [options.separator=""] String inserted between the value and unit.
 * @param {boolean} [options.trimTrailingZeros=false] Remove insignificant zeros from the fractional part.
 * @returns {string} Human-readable representation of the byte size.
 */
function formatByteSize(
    bytes,
    {
        decimals = 1,
        decimalsForBytes = 0,
        separator = "",
        trimTrailingZeros = false
    } = {}
) {
    let value = normalizeByteCount(bytes);
    let unitIndex = 0;

    while (value >= BYTE_RADIX && unitIndex < BYTE_UNITS.length - 1) {
        value /= BYTE_RADIX;
        unitIndex += 1;
    }

    const decimalPlaces =
        unitIndex === 0 ? Math.max(0, decimalsForBytes) : Math.max(0, decimals);

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

export { formatByteSize, formatBytes };
