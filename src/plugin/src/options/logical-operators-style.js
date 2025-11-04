import { createEnumeratedOptionHelpers } from "../shared/index.js";

const LogicalOperatorsStyle = Object.freeze({
    KEYWORDS: "keywords",
    SYMBOLS: "symbols"
});

export const DEFAULT_LOGICAL_OPERATORS_STYLE = LogicalOperatorsStyle.KEYWORDS;

const {
    values: LOGICAL_OPERATORS_STYLE_VALUES,
    isValid: isLogicalOperatorsStyle,
    normalize: normalizeLogicalOperatorsStyleBase
} = createEnumeratedOptionHelpers(LogicalOperatorsStyle, {
    defaultValue: DEFAULT_LOGICAL_OPERATORS_STYLE,
    coerce(value) {
        if (typeof value !== "string") {
            throw new TypeError(
                `logicalOperatorsStyle must be provided as a string. Received: ${typeof value}.`
            );
        }

        return value.trim();
    }
});

/**
 * Normalize a user-provided logical operator style option into a canonical
 * value.
 *
 * The helper trims surrounding whitespace, enforces that the result is one of
 * the enumerated styles, and falls back to the default when callers omit the
 * option altogether. Invalid values raise descriptive `TypeError`/`RangeError`
 * instances so CLI error messaging can surface actionable feedback.
 *
 * @param {unknown} rawStyle Untrusted option value supplied by the caller.
 * @returns {LogicalOperatorsStyle} Canonical logical operator style string.
 * @throws {TypeError | RangeError} When the value cannot be coerced into a
 *         supported style label.
 */
export function normalizeLogicalOperatorsStyle(rawStyle) {
    const normalized = normalizeLogicalOperatorsStyleBase(rawStyle);

    if (normalized === null) {
        const validStylesMessage = LOGICAL_OPERATORS_STYLE_VALUES.map(
            (value) => `'${value}'`
        ).join(", ");
        throw new RangeError(
            `logicalOperatorsStyle must be one of: ${validStylesMessage}. Received: ${JSON.stringify(rawStyle)}.`
        );
    }

    return normalized;
}

export { LogicalOperatorsStyle, isLogicalOperatorsStyle };
