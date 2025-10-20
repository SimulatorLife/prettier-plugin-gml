import { normalizeEnumeratedOption } from "../../../shared/enumerated-option-utils.js";

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

export function isLogicalOperatorsStyle(value) {
    return LOGICAL_OPERATORS_STYLE_SET.has(value);
}

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
