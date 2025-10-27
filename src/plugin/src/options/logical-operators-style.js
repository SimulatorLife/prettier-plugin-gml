import { normalizeEnumeratedOption } from "../shared/index.js";

const LogicalOperatorsStyle = Object.freeze({
    KEYWORDS: "keywords",
    SYMBOLS: "symbols"
});

const LOGICAL_OPERATORS_STYLE_VALUES = Object.freeze(
    Object.values(LogicalOperatorsStyle)
);

const LOGICAL_OPERATORS_STYLE_SET = new Set(LOGICAL_OPERATORS_STYLE_VALUES);

const VALID_STYLES_MESSAGE = LOGICAL_OPERATORS_STYLE_VALUES.map(
    (value) => `'${value}'`
).join(", ");

export const DEFAULT_LOGICAL_OPERATORS_STYLE = LogicalOperatorsStyle.KEYWORDS;

/**
 * Check whether the provided value matches one of the supported logical
 * operator style identifiers.
 *
 * Consumers frequently receive untyped config (for example CLI flags or JSON
 * options) and need a quick membership test without re-threading the
 * enumerated set. Non-string values are rejected by the underlying `Set`
 * membership check, keeping the guard aligned with
 * {@link normalizeLogicalOperatorsStyle}.
 *
 * @param {unknown} value Candidate option value to inspect.
 * @returns {value is keyof typeof LogicalOperatorsStyle} `true` when the value
 *          maps to a known logical operator style.
 */
export function isLogicalOperatorsStyle(value) {
    return LOGICAL_OPERATORS_STYLE_SET.has(value);
}

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
    if (rawStyle === undefined) {
        return DEFAULT_LOGICAL_OPERATORS_STYLE;
    }

    const normalized = normalizeEnumeratedOption(
        rawStyle,
        null,
        LOGICAL_OPERATORS_STYLE_SET,
        {
            coerce(value) {
                if (typeof value !== "string") {
                    throw new TypeError(
                        `logicalOperatorsStyle must be provided as a string. Received: ${typeof value}.`
                    );
                }

                return value.trim();
            }
        }
    );

    if (normalized === null) {
        throw new RangeError(
            `logicalOperatorsStyle must be one of: ${VALID_STYLES_MESSAGE}. Received: ${JSON.stringify(rawStyle)}.`
        );
    }

    return normalized;
}

export { LogicalOperatorsStyle };
