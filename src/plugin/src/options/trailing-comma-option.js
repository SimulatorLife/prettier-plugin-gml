import { describeValueForError } from "../shared/index.js";

const TRAILING_COMMA = Object.freeze({
    NONE: "none",
    ES5: "es5",
    ALL: "all"
});

const TRAILING_COMMA_VALUES = Object.freeze(Object.values(TRAILING_COMMA));
const TRAILING_COMMA_SET = new Set(TRAILING_COMMA_VALUES);
const TRAILING_COMMA_LIST = TRAILING_COMMA_VALUES.join(", ");

function isTrailingCommaValue(value) {
    return typeof value === "string" && TRAILING_COMMA_SET.has(value);
}

function assertTrailingCommaValue(value) {
    if (isTrailingCommaValue(value)) {
        return value;
    }

    const received = describeValueForError(value);
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
