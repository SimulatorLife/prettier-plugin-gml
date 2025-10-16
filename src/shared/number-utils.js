/**
 * Determine whether the provided value is a finite number.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {value is number} `true` when `value` is a finite number.
 */
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

const BYTE_UNITS = Object.freeze(["B", "KB", "MB", "GB", "TB", "PB"]);
const BYTE_RADIX = 1024;
const FLOAT_COMPARISON_TOLERANCE_MULTIPLIER = 8;

/**
 * Determine whether two floating point numbers are effectively equal within a
 * scaled tolerance. The scale prevents comparisons near larger unit
 * thresholds from requiring impossibly tiny differences to be considered a
 * match.
 */
function areApproximatelyEqual(a, b) {
    if (a === b) {
        return true;
    }

    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    const tolerance =
        Number.EPSILON * scale * FLOAT_COMPARISON_TOLERANCE_MULTIPLIER;

    return Math.abs(a - b) <= tolerance;
}

function isApproximatelyAtLeast(value, threshold) {
    return value > threshold || areApproximatelyEqual(value, threshold);
}

function normalizeByteCount(value) {
    const numericValue = typeof value === "bigint" ? Number(value) : value;

    if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
        return 0;
    }

    return Math.max(numericValue, 0);
}

/**
 * Format a byte count using human-readable units.
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

    while (
        unitIndex < BYTE_UNITS.length - 1 &&
        isApproximatelyAtLeast(value, BYTE_RADIX)
    ) {
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

function formatDuration(startTime) {
    const deltaMs = Date.now() - startTime;
    if (deltaMs < 1000) {
        return `${deltaMs}ms`;
    }

    return `${(deltaMs / 1000).toFixed(1)}s`;
}

function formatBytes(text) {
    const size = Buffer.byteLength(text, "utf8");
    return formatByteSize(size, { decimals: 1 });
}

function timeSync(label, fn, { verbose }) {
    if (verbose.parsing) {
        console.log(`→ ${label}`);
    }

    const startTime = Date.now();
    const result = fn();

    if (verbose.parsing) {
        console.log(`  ${label} completed in ${formatDuration(startTime)}.`);
    }

    return result;
}

export {
    timeSync,
    formatBytes,
    formatDuration,
    formatByteSize,
    isFiniteNumber
};
