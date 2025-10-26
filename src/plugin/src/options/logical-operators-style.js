import {
    describeValueWithQuotes,
    normalizeEnumeratedOption
} from "../shared/index.js";

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
                    const received = describeValueWithQuotes(value, {
                        nullDescription: "null"
                    });

                    throw new TypeError(
                        `logicalOperatorsStyle must be provided as a string. Received: ${received}.`
                    );
                }

                return value.trim();
            }
        }
    );

    if (normalized === null) {
        const received = describeValueWithQuotes(rawStyle, {
            nullDescription: "null"
        });

        throw new RangeError(
            `logicalOperatorsStyle must be one of: ${VALID_STYLES_MESSAGE}. Received: ${received}.`
        );
    }

    return normalized;
}

export { LogicalOperatorsStyle };
