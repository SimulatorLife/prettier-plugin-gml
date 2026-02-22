/**
 * GML does not support true trailing commas.
 *
 * A comma inside a call expression always represents a positional argument.
 * Writing `fn(a, b,)` does not mean “trailing comma” — it means there is an
 * additional argument after `b`. In GML, omitted arguments are represented
 * positionally (e.g. `fn(,,x)`), which evaluates to:
 *
 *     fn(undefined, undefined, x)
 *
 * Therefore, a trailing comma in arguments is not a formatting feature;
 * it changes arity and semantics by introducing an explicit `undefined`
 * argument slot.
 *
 * Because of this, the only valid option value is "none". Any other option
 * should produce a clear warning and be ignored.
 */
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
