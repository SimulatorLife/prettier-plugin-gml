/**
 * Determine whether the provided value is a finite number.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {value is number} `true` when `value` is a finite number.
 */
export function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

const BYTE_UNITS = Object.freeze(["B", "KB", "MB", "GB", "TB", "PB"]);
const BYTE_RADIX = 1024;

function normalizeByteCount(value) {
    if (typeof value === "bigint") {
        value = Number(value);
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(value, 0);
}

export function formatByteSize(
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
