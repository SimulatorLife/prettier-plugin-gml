import { createEnumeratedOptionHelpers } from "../shared/index.js";

const TRAILING_COMMA = Object.freeze({
    NONE: "none",
    ES5: "es5",
    ALL: "all"
});

const {
    values: TRAILING_COMMA_VALUES,
    set: TRAILING_COMMA_SET,
    list: TRAILING_COMMA_LIST,
    isValid: isTrailingCommaValue,
    assert: assertTrailingCommaValue
} = createEnumeratedOptionHelpers(TRAILING_COMMA, {
    optionName: "Trailing comma override"
});

export {
    TRAILING_COMMA,
    TRAILING_COMMA_LIST,
    TRAILING_COMMA_VALUES,
    TRAILING_COMMA_SET,
    assertTrailingCommaValue,
    isTrailingCommaValue
};
