import { Core } from "@gml-modules/core";
import type * as Prettier from "prettier";

type TrailingCommaOption = Prettier.RequiredOptions["trailingComma"];
const { createEnumeratedOptionHelpers } = Core;

const TRAILING_COMMA = Object.freeze({
    NONE: "none",
    ES5: "es5",
    ALL: "all"
} as const) satisfies Record<"NONE" | "ES5" | "ALL", TrailingCommaOption>;

const trailingCommaHelpers = createEnumeratedOptionHelpers(Object.values(TRAILING_COMMA), {
    formatError: (list, received) => `Trailing comma override must be one of: ${list}. Received: ${received}.`,
    enforceStringType: true,
    valueLabel: "Trailing comma override"
});

function isTrailingCommaValue(value: unknown): value is TrailingCommaOption {
    return trailingCommaHelpers.normalize(value, null) !== null;
}

function assertTrailingCommaValue(value: unknown): TrailingCommaOption {
    return trailingCommaHelpers.requireValue(value, TypeError) as TrailingCommaOption;
}

export { assertTrailingCommaValue, isTrailingCommaValue, TRAILING_COMMA };
