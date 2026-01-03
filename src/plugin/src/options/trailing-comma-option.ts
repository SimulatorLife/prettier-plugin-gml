import { Core } from "@gml-modules/core";
import type * as Prettier from "prettier";

type TrailingCommaOption = Prettier.RequiredOptions["trailingComma"];

const TRAILING_COMMA = Object.freeze({
    NONE: "none",
    ES5: "es5",
    ALL: "all"
} as const) satisfies Record<"NONE" | "ES5" | "ALL", TrailingCommaOption>;

const TRAILING_COMMA_VALUES = Object.freeze(Object.values(TRAILING_COMMA));
const TRAILING_COMMA_SET = new Set(TRAILING_COMMA_VALUES);
const TRAILING_COMMA_LIST = TRAILING_COMMA_VALUES.join(", ");

function normalizeTrailingCommaValue(value: unknown): TrailingCommaOption | null {
    return Core.normalizeEnumeratedOption(value, null, TRAILING_COMMA_SET, {
        coerce(candidate) {
            return typeof candidate === "string" ? candidate.trim() : "";
        }
    });
}

function isTrailingCommaValue(value: unknown): value is TrailingCommaOption {
    return normalizeTrailingCommaValue(value) !== null;
}

function assertTrailingCommaValue(value: unknown): TrailingCommaOption {
    const normalized = normalizeTrailingCommaValue(value);
    if (normalized !== null) {
        return normalized;
    }

    const received = Core.describeValueForError(value);
    throw new TypeError(`Trailing comma override must be one of: ${TRAILING_COMMA_LIST}. Received: ${received}.`);
}

export { TRAILING_COMMA, assertTrailingCommaValue, isTrailingCommaValue };
