import { assertFunction } from "../shared/index.js";

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
    trailingComma: "none",
    arrowParens: "always",
    singleAttributePerLine: false,
    jsxSingleQuote: false,
    proseWrap: "preserve",
    htmlWhitespaceSensitivity: "css"
});

const TRAILING_COMMA_VALUES = new Set(["none", "es5", "all"]);
const ARROW_PARENS_VALUES = new Set(["always", "avoid"]);
const PROSE_WRAP_VALUES = new Set(["always", "never", "preserve"]);
const HTML_WHITESPACE_SENSITIVITY_VALUES = new Set(["css", "strict", "ignore"]);

let coreOptionOverridesResolver = null;

function normalizeBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}

function normalizeChoice(value, allowedValues) {
    if (typeof value !== "string") {
        return;
    }

    return allowedValues.has(value) ? value : undefined;
}

const CORE_OVERRIDE_NORMALIZERS = {
    trailingComma: (value) => normalizeChoice(value, TRAILING_COMMA_VALUES),
    arrowParens: (value) => normalizeChoice(value, ARROW_PARENS_VALUES),
    singleAttributePerLine: (value) => normalizeBoolean(value),
    jsxSingleQuote: (value) => normalizeBoolean(value),
    proseWrap: (value) => normalizeChoice(value, PROSE_WRAP_VALUES),
    htmlWhitespaceSensitivity: (value) =>
        normalizeChoice(value, HTML_WHITESPACE_SENSITIVITY_VALUES)
};

const CORE_OVERRIDE_KEYS = Object.keys(CORE_OVERRIDE_NORMALIZERS);

function normalizeCoreOptionOverrides(overrides) {
    if (overrides === DEFAULT_CORE_OPTION_OVERRIDES) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    if (!overrides || typeof overrides !== "object") {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    let changed = false;
    const normalizedEntries = [];

    for (const key of CORE_OVERRIDE_KEYS) {
        const defaultValue = DEFAULT_CORE_OPTION_OVERRIDES[key];

        if (!Object.hasOwn(overrides, key)) {
            normalizedEntries.push([key, defaultValue]);
            continue;
        }

        const candidate = overrides[key];

        if (candidate == null) {
            changed = true;
            continue;
        }

        const value = CORE_OVERRIDE_NORMALIZERS[key](candidate);

        if (value === undefined) {
            normalizedEntries.push([key, defaultValue]);
            continue;
        }

        if (value !== defaultValue) {
            changed = true;
        }

        normalizedEntries.push([key, value]);
    }

    if (!changed && normalizedEntries.length === CORE_OVERRIDE_KEYS.length) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    return Object.freeze(Object.fromEntries(normalizedEntries));
}

function resolveCoreOptionOverrides(options = {}) {
    if (!coreOptionOverridesResolver) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    return normalizeCoreOptionOverrides(
        coreOptionOverridesResolver(options) ?? DEFAULT_CORE_OPTION_OVERRIDES
    );
}

function setCoreOptionOverridesResolver(resolver) {
    coreOptionOverridesResolver = assertFunction(resolver, "resolver", {
        errorMessage:
            "Core option override resolvers must be functions that return override objects"
    });
    return resolveCoreOptionOverrides();
}

function restoreDefaultCoreOptionOverridesResolver() {
    coreOptionOverridesResolver = null;
    return DEFAULT_CORE_OPTION_OVERRIDES;
}

export {
    DEFAULT_CORE_OPTION_OVERRIDES,
    resolveCoreOptionOverrides,
    restoreDefaultCoreOptionOverridesResolver,
    setCoreOptionOverridesResolver
};
