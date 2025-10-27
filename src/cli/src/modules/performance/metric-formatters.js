import { isFiniteNumber } from "../../shared/dependencies.js";

/**
 * Format numeric benchmark metrics while tolerating missing data. Non-finite
 * inputs yield the "n/a" sentinel so command output stays informative without
 * crashing or exposing raw `null` values.
 *
 * @param {unknown} value Potential numeric metric value.
 * @param {{
 *   unit?: string,
 *   precision?: number,
 *   unitSeparator?: string
 * }} [options]
 * @returns {string} Human-friendly metric label or "n/a" when unavailable.
 */
export function formatMetricValue(
    value,
    { unit, precision = 3, unitSeparator = " " } = {}
) {
    if (!isFiniteNumber(value)) {
        return "n/a";
    }

    const formatted = Number(value).toFixed(precision);

    if (!unit) {
        return formatted;
    }

    const separator = unitSeparator ?? "";
    return `${formatted}${separator}${unit}`;
}
