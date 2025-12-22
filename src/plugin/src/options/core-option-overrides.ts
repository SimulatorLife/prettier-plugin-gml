import { Core } from "@gml-modules/core";
import {
    TRAILING_COMMA,
    assertTrailingCommaValue
} from "./trailing-comma-option.js";

type TrailingCommaOption = (typeof TRAILING_COMMA)[keyof typeof TRAILING_COMMA];
type ArrowParensOption = "always" | "avoid";
type ProseWrapOption = "always" | "never" | "preserve";
type HtmlWhitespaceSensitivityOption = "css" | "strict" | "ignore";

type CoreOptionOverrides = Readonly<{
    trailingComma: TrailingCommaOption;
    arrowParens: ArrowParensOption;
    singleAttributePerLine: boolean;
    jsxSingleQuote: boolean;
    proseWrap: ProseWrapOption;
    htmlWhitespaceSensitivity: HtmlWhitespaceSensitivityOption;
}>;

type CoreOverrideKey = keyof CoreOptionOverrides;
type CoreOverrideNormalizer = (
    value: unknown
) => CoreOptionOverrides[CoreOverrideKey] | undefined;
type CoreOptionOverridesResolver = (
    options: Record<string, unknown>
) => CoreOptionOverrides | Record<string, unknown> | null | undefined;

// Hard overrides for GML regardless of incoming config. These knobs either map
// to syntax that GameMaker never emits (for example JSX attributes) or would let
// callers re-enable formatting modes the printers deliberately avoid. The
// fixtures showcased in README.md#formatter-at-a-glance and the docs/examples/*
// snapshots assume "no trailing commas" plus "always-parenthesised arrow
// parameters", so letting user configs flip those bits would desynchronise the
// documented contract from the code we ship. We therefore expose the default map
// here while giving advanced hosts a narrow hook for swapping or removing
// specific entries.

const DEFAULT_CORE_OPTION_OVERRIDES = Object.freeze({
    trailingComma: TRAILING_COMMA.NONE,
    arrowParens: "always",
    singleAttributePerLine: false,
    jsxSingleQuote: false,
    proseWrap: "preserve",
    htmlWhitespaceSensitivity: "css"
} satisfies CoreOptionOverrides);

const ARROW_PARENS_VALUES: ReadonlySet<ArrowParensOption> = new Set([
    "always",
    "avoid"
]);
const PROSE_WRAP_VALUES: ReadonlySet<ProseWrapOption> = new Set([
    "always",
    "never",
    "preserve"
]);
const HTML_WHITESPACE_SENSITIVITY_VALUES: ReadonlySet<HtmlWhitespaceSensitivityOption> =
    new Set(["css", "strict", "ignore"]);

let customResolver: CoreOptionOverridesResolver | null = null;

function normalizeBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

function normalizeChoice<T extends string>(
    value: unknown,
    allowedValues: ReadonlySet<T>
): T | undefined {
    return typeof value === "string" && allowedValues.has(value as T)
        ? (value as T)
        : undefined;
}

function normalizeTrailingCommaOverride(
    value: unknown
): TrailingCommaOption | undefined {
    return typeof value === "string"
        ? assertTrailingCommaValue(value)
        : undefined;
}

const CORE_OVERRIDE_NORMALIZERS: Record<
    CoreOverrideKey,
    CoreOverrideNormalizer
> = {
    trailingComma: (value) => normalizeTrailingCommaOverride(value),
    arrowParens: (value) => normalizeChoice(value, ARROW_PARENS_VALUES),
    singleAttributePerLine: (value) => normalizeBoolean(value),
    jsxSingleQuote: (value) => normalizeBoolean(value),
    proseWrap: (value) => normalizeChoice(value, PROSE_WRAP_VALUES),
    htmlWhitespaceSensitivity: (value) =>
        normalizeChoice(value, HTML_WHITESPACE_SENSITIVITY_VALUES)
};

const CORE_OVERRIDE_KEYS = Object.keys(
    CORE_OVERRIDE_NORMALIZERS
) as CoreOverrideKey[];

function normalizeOverrideEntries(
    overrides: Partial<Record<CoreOverrideKey, unknown>>
): {
    changedFromDefault: boolean;
    entries: Array<[CoreOverrideKey, CoreOptionOverrides[CoreOverrideKey]]>;
} {
    let changedFromDefault = false;
    const entries: Array<
        [CoreOverrideKey, CoreOptionOverrides[CoreOverrideKey]]
    > = [];

    for (const key of CORE_OVERRIDE_KEYS) {
        const defaultValue = DEFAULT_CORE_OPTION_OVERRIDES[key];

        if (!Object.hasOwn(overrides, key)) {
            entries.push([key, defaultValue]);
            continue;
        }

        const candidate = overrides[key];

        if (candidate == null) {
            changedFromDefault = true;
            continue;
        }

        const normalizedValue = CORE_OVERRIDE_NORMALIZERS[key](candidate);

        if (normalizedValue === undefined) {
            entries.push([key, defaultValue]);
            continue;
        }

        if (normalizedValue !== defaultValue) {
            changedFromDefault = true;
        }

        entries.push([key, normalizedValue]);
    }

    return { changedFromDefault, entries };
}

function normalizeCoreOptionOverrides(overrides: unknown): CoreOptionOverrides {
    if (overrides === DEFAULT_CORE_OPTION_OVERRIDES) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    if (!overrides || typeof overrides !== "object") {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    const overrideRecord = overrides as Partial<
        Record<CoreOverrideKey, unknown>
    >;
    const { changedFromDefault, entries } =
        normalizeOverrideEntries(overrideRecord);

    if (!changedFromDefault && entries.length === CORE_OVERRIDE_KEYS.length) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    return Object.freeze(Object.fromEntries(entries) as CoreOptionOverrides);
}

/**
 * Resolve the effective Prettier core option overrides for the current run.
 *
 * When a custom {@link coreOptionOverridesResolver} has been registered the
 * helper invokes it with the provided {@link options} bag and then normalizes
 * the result back to the canonical override object. Missing resolvers fall
 * through to {@link DEFAULT_CORE_OPTION_OVERRIDES}, ensuring call sites always
 * receive a frozen map with the expected keys even when hosts opt out of any
 * customization.
 *
 * @param {Record<string, unknown>} [options] Context forwarded to the active
 *        override resolver.
 * @returns {typeof DEFAULT_CORE_OPTION_OVERRIDES} Frozen override map that is
 *          safe to reuse across print invocations.
 */
function resolveCoreOptionOverrides(
    options: Record<string, unknown> = {}
): CoreOptionOverrides {
    if (!customResolver) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }
    const result = customResolver(options);
    return normalizeCoreOptionOverrides(
        result ?? DEFAULT_CORE_OPTION_OVERRIDES
    );
}

function setCoreOptionOverridesResolver(
    resolver: CoreOptionOverridesResolver
): CoreOptionOverrides {
    Core.assertFunction(resolver, "resolver", {
        errorMessage:
            "Core option override resolvers must be functions that return override objects"
    });
    customResolver = resolver;
    return resolveCoreOptionOverrides();
}

function restoreDefaultCoreOptionOverridesResolver(): CoreOptionOverrides {
    customResolver = null;
    return DEFAULT_CORE_OPTION_OVERRIDES;
}

export {
    DEFAULT_CORE_OPTION_OVERRIDES,
    resolveCoreOptionOverrides,
    restoreDefaultCoreOptionOverridesResolver,
    setCoreOptionOverridesResolver
};
