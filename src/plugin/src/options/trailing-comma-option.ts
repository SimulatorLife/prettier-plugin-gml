import { Core } from "@gml-modules/core";
import type * as Prettier from "prettier";

type TrailingCommaOption = Prettier.RequiredOptions["trailingComma"];

const TRAILING_COMMA = Object.freeze({
    NONE: "none",
    ES5: "es5",
    ALL: "all"
} as const) satisfies Record<"NONE" | "ES5" | "ALL", TrailingCommaOption>;

const TRAILING_COMMA_VALUES = Object.freeze(
    Object.values(TRAILING_COMMA)
) as readonly TrailingCommaOption[];
const TRAILING_COMMA_SET = new Set(TRAILING_COMMA_VALUES);
const TRAILING_COMMA_LIST = TRAILING_COMMA_VALUES.join(", ");

function isTrailingCommaValue(value: unknown): value is TrailingCommaOption {
    return (
        typeof value === "string" &&
        TRAILING_COMMA_SET.has(value as TrailingCommaOption)
    );
}

function assertTrailingCommaValue(value: unknown): TrailingCommaOption {
    if (isTrailingCommaValue(value)) {
        return value;
    }

    const received = Core.describeValueForError(value);
    throw new TypeError(
        `Trailing comma override must be one of: ${TRAILING_COMMA_LIST}. Received: ${received}.`
    );
}

export {
    TRAILING_COMMA,
    TRAILING_COMMA_LIST,
    TRAILING_COMMA_VALUES,
    assertTrailingCommaValue,
    isTrailingCommaValue
};
