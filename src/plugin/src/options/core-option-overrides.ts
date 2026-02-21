/**
 * @gml-modules/lint
 *
 * Prettier core options include many knobs that are either:
 * 1) Invalid for GML (would generate non-GML syntax or change semantics)
 * 2) Irrelevant for GML (JSX/HTML/prose options; no effect on GML printers)
 * 3) Prettier-compat shims (options that exist in core configs but do not map
 *    to any GML syntax feature)
 *
 * This module resolves a small set of Prettier-core option overrides with a
 * strict contract:
 *
 * - "forced" options are hard-locked to a single safe value regardless of user
 *   config (e.g. trailing commas).
 * - "noop" options are accepted for config compatibility but are always locked
 *   to their default because they have no meaning in GML output (e.g. arrowParens).
 * - "irrelevant" options are also locked to default because they apply to other
 *   languages (JSX/HTML/prose) and should never influence GML output.
 *
 * Warning policy:
 * - This module never prints directly to console.
 * - Hosts may optionally provide a warning sink in the `options` bag passed to
 *   `resolveCoreOptionOverrides()`:
 *
 *     resolveCoreOptionOverrides({ onCoreOptionOverrideWarning: (w) => ... })
 *
 * Warnings are emitted when callers explicitly attempt to set unsupported values
 * (or attempt to remove forced keys).
 */

import { Core } from "@gml-modules/core";

import { assertTrailingCommaValue, TRAILING_COMMA } from "./trailing-comma-option.js";

const { isObjectLike } = Core;

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

type CoreOptionOverridesResolver = (
    options: Record<string, unknown>
) => CoreOptionOverrides | Record<string, unknown> | null | undefined;

type CoreOptionOverrideWarning = Readonly<{
    key: CoreOverrideKey;
    message: string;
    providedValue: unknown;
    appliedValue: unknown;
}>;

type WarningSink = (warning: CoreOptionOverrideWarning) => void;

const WARNING_SINK_OPTION_KEY = "onCoreOptionOverrideWarning";

function get_warning_sink(options: Record<string, unknown>): WarningSink | null {
    const candidate = options[WARNING_SINK_OPTION_KEY];
    return typeof candidate === "function" ? (candidate as WarningSink) : null;
}

function warn_override(
    options: Record<string, unknown>,
    key: CoreOverrideKey,
    message: string,
    providedValue: unknown,
    appliedValue: unknown
): void {
    const sink = get_warning_sink(options);
    if (!sink) {
        return;
    }
    sink(Object.freeze({ key, message, providedValue, appliedValue }));
}

// Hard overrides for GML regardless of incoming config.
// - trailingComma is forced to "none" because commas in argument lists are
//   positional: `fn(a, b,)` implies an extra argument slot, and `fn(,,x)`
//   corresponds to `fn(undefined, undefined, x)`.
// - arrowParens is a Prettier-core compatibility option that has no meaning for
//   GML (there are no arrow functions), so it is locked to its default to avoid
//   implying configurability.
// - JSX/HTML/prose options are irrelevant to GML output, but are kept in the
//   override map to satisfy hosts that forward shared Prettier configs.

const DEFAULT_CORE_OPTION_OVERRIDES = Object.freeze({
    trailingComma: TRAILING_COMMA.NONE,
    arrowParens: "always",
    singleAttributePerLine: false,
    jsxSingleQuote: false,
    proseWrap: "preserve",
    htmlWhitespaceSensitivity: "css"
} satisfies CoreOptionOverrides);

type OptionKind = "forced" | "noop" | "irrelevant";

type OptionSpec<K extends CoreOverrideKey> = Readonly<{
    key: K;
    kind: OptionKind;
    defaultValue: CoreOptionOverrides[K];
    normalizeUserValue: (value: unknown) => CoreOptionOverrides[K] | undefined;
    canBeRemoved: boolean;
    invalidMessage: string;
    ignoredMessage: string;
    removedMessage: string;
}>;

const ARROW_PARENS_VALUES: ReadonlySet<ArrowParensOption> = new Set(["always", "avoid"]);
const PROSE_WRAP_VALUES: ReadonlySet<ProseWrapOption> = new Set(["always", "never", "preserve"]);
const HTML_WHITESPACE_SENSITIVITY_VALUES: ReadonlySet<HtmlWhitespaceSensitivityOption> = new Set([
    "css",
    "strict",
    "ignore"
]);

function normalizeBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

function normalizeChoice<T extends string>(value: unknown, allowedValues: ReadonlySet<T>): T | undefined {
    return typeof value === "string" && allowedValues.has(value as T) ? (value as T) : undefined;
}

function normalizeTrailingCommaOverride(value: unknown): TrailingCommaOption | undefined {
    return typeof value === "string" ? assertTrailingCommaValue(value) : undefined;
}

const OPTION_SPECS: Readonly<Record<CoreOverrideKey, OptionSpec<CoreOverrideKey>>> = Object.freeze({
    trailingComma: Object.freeze({
        key: "trailingComma",
        kind: "forced",
        defaultValue: DEFAULT_CORE_OPTION_OVERRIDES.trailingComma,
        normalizeUserValue: (value) => normalizeTrailingCommaOverride(value),
        canBeRemoved: false,
        invalidMessage: 'Invalid "trailingComma" value for GML; only "none" is supported.',
        ignoredMessage:
            'Ignoring "trailingComma" override because GML does not support trailing commas and commas in calls are positional.',
        removedMessage: 'Ignoring removal of "trailingComma" because the key is required for GML safety.'
    }),
    arrowParens: Object.freeze({
        key: "arrowParens",
        kind: "noop",
        defaultValue: DEFAULT_CORE_OPTION_OVERRIDES.arrowParens,
        normalizeUserValue: (value) => normalizeChoice(value, ARROW_PARENS_VALUES),
        canBeRemoved: true,
        invalidMessage: 'Invalid "arrowParens" value.',
        ignoredMessage: 'Ignoring "arrowParens" override because it has no meaning for GML.',
        removedMessage: 'Removed "arrowParens" override entry.'
    }),
    singleAttributePerLine: Object.freeze({
        key: "singleAttributePerLine",
        kind: "irrelevant",
        defaultValue: DEFAULT_CORE_OPTION_OVERRIDES.singleAttributePerLine,
        normalizeUserValue: (value) => normalizeBoolean(value),
        canBeRemoved: true,
        invalidMessage: 'Invalid "singleAttributePerLine" value.',
        ignoredMessage: 'Ignoring "singleAttributePerLine" override because it is not applicable to GML.',
        removedMessage: 'Removed "singleAttributePerLine" override entry.'
    }),
    jsxSingleQuote: Object.freeze({
        key: "jsxSingleQuote",
        kind: "irrelevant",
        defaultValue: DEFAULT_CORE_OPTION_OVERRIDES.jsxSingleQuote,
        normalizeUserValue: (value) => normalizeBoolean(value),
        canBeRemoved: true,
        invalidMessage: 'Invalid "jsxSingleQuote" value.',
        ignoredMessage: 'Ignoring "jsxSingleQuote" override because it is not applicable to GML.',
        removedMessage: 'Removed "jsxSingleQuote" override entry.'
    }),
    proseWrap: Object.freeze({
        key: "proseWrap",
        kind: "irrelevant",
        defaultValue: DEFAULT_CORE_OPTION_OVERRIDES.proseWrap,
        normalizeUserValue: (value) => normalizeChoice(value, PROSE_WRAP_VALUES),
        canBeRemoved: true,
        invalidMessage: 'Invalid "proseWrap" value.',
        ignoredMessage: 'Ignoring "proseWrap" override because it is not applicable to GML.',
        removedMessage: 'Removed "proseWrap" override entry.'
    }),
    htmlWhitespaceSensitivity: Object.freeze({
        key: "htmlWhitespaceSensitivity",
        kind: "irrelevant",
        defaultValue: DEFAULT_CORE_OPTION_OVERRIDES.htmlWhitespaceSensitivity,
        normalizeUserValue: (value) => normalizeChoice(value, HTML_WHITESPACE_SENSITIVITY_VALUES),
        canBeRemoved: true,
        invalidMessage: 'Invalid "htmlWhitespaceSensitivity" value.',
        ignoredMessage: 'Ignoring "htmlWhitespaceSensitivity" override because it is not applicable to GML.',
        removedMessage: 'Removed "htmlWhitespaceSensitivity" override entry.'
    })
});

const CORE_OVERRIDE_KEYS = Object.keys(OPTION_SPECS) as CoreOverrideKey[];

let customResolver: CoreOptionOverridesResolver | null = null;

function normalizeOverrideEntries(
    options: Record<string, unknown>,
    overrides: Partial<Record<CoreOverrideKey, unknown>>
): {
    changedFromDefault: boolean;
    entries: Array<[CoreOverrideKey, CoreOptionOverrides[CoreOverrideKey]]>;
} {
    let changedFromDefault = false;
    const entries: Array<[CoreOverrideKey, CoreOptionOverrides[CoreOverrideKey]]> = [];

    for (const key of CORE_OVERRIDE_KEYS) {
        const spec = OPTION_SPECS[key];
        const defaultValue = spec.defaultValue;

        if (!Object.hasOwn(overrides, key)) {
            entries.push([key, defaultValue]);
            continue;
        }

        const providedValue = overrides[key];

        if (providedValue == null) {
            if (!spec.canBeRemoved) {
                warn_override(options, key, spec.removedMessage, providedValue, defaultValue);
                entries.push([key, defaultValue]);
                continue;
            }

            changedFromDefault = true;
            warn_override(options, key, spec.removedMessage, providedValue, undefined);
            continue;
        }

        const normalizedValue = spec.normalizeUserValue(providedValue);

        if (normalizedValue === undefined) {
            warn_override(options, key, spec.invalidMessage, providedValue, defaultValue);
            entries.push([key, defaultValue]);
            continue;
        }

        // forced/noop/irrelevant all lock to default; only "forced" needs a stricter message,
        // but all user changes are ignored to avoid implying these options affect GML output.
        if (normalizedValue !== defaultValue) {
            warn_override(options, key, spec.ignoredMessage, providedValue, defaultValue);
        }

        entries.push([key, defaultValue]);
    }

    // We only consider this changed if keys were removed (null) because all values are locked to defaults.
    if (entries.length !== CORE_OVERRIDE_KEYS.length) {
        changedFromDefault = true;
    }

    return { changedFromDefault, entries };
}

function normalizeCoreOptionOverrides(options: Record<string, unknown>, overrides: unknown): CoreOptionOverrides {
    if (overrides === DEFAULT_CORE_OPTION_OVERRIDES) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    if (!isObjectLike(overrides)) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    const overrideRecord = overrides as Partial<Record<CoreOverrideKey, unknown>>;
    const { changedFromDefault, entries } = normalizeOverrideEntries(options, overrideRecord);

    if (!changedFromDefault && entries.length === CORE_OVERRIDE_KEYS.length) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    return Object.freeze(Object.fromEntries(entries) as CoreOptionOverrides);
}

/**
 * Resolve the effective Prettier core option overrides for the current run.
 *
 * The returned object is always frozen. Keys are present unless a host resolver
 * explicitly removes an entry by returning `{ key: null }` for removables.
 *
 * Note: "forced", "noop", and "irrelevant" options are value-locked to the
 * DEFAULT_CORE_OPTION_OVERRIDES. User-provided values are ignored (optionally
 * warned) to prevent non-GML behavior or misleading configurability.
 *
 * @param {Record<string, unknown>} [options] Context forwarded to the active
 *        override resolver. May include `onCoreOptionOverrideWarning`.
 * @returns {typeof DEFAULT_CORE_OPTION_OVERRIDES} Frozen override map that is
 *          safe to reuse across print invocations.
 */
function resolveCoreOptionOverrides(options: Record<string, unknown> = {}): CoreOptionOverrides {
    if (!customResolver) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    const result = customResolver(options);
    return normalizeCoreOptionOverrides(options, result ?? DEFAULT_CORE_OPTION_OVERRIDES);
}

function setCoreOptionOverridesResolver(resolver: CoreOptionOverridesResolver): CoreOptionOverrides {
    Core.assertFunction(resolver, "resolver", {
        errorMessage: "Core option override resolvers must be functions that return override objects"
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
