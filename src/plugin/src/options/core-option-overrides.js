import { hasOwn } from "../shared/index.js";
import { createResolverController } from "../shared/resolver-controller.js";
import {
    TRAILING_COMMA,
    assertTrailingCommaValue
} from "./trailing-comma-option.js";

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
});

const ARROW_PARENS_VALUES = new Set(["always", "avoid"]);
const PROSE_WRAP_VALUES = new Set(["always", "never", "preserve"]);
const HTML_WHITESPACE_SENSITIVITY_VALUES = new Set(["css", "strict", "ignore"]);

const {
    resolution: coreOptionOverridesResolution,
    registry: coreOptionOverridesRegistry
} = createResolverController({
    defaultFactory: () => DEFAULT_CORE_OPTION_OVERRIDES,
    normalize(result) {
        return normalizeCoreOptionOverrides(
            result ?? DEFAULT_CORE_OPTION_OVERRIDES
        );
    },
    errorMessage:
        "Core option override resolvers must be functions that return override objects"
});

function normalizeBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}

function normalizeChoice(value, allowedValues) {
    if (typeof value !== "string") {
        return;
    }

    return allowedValues.has(value) ? value : undefined;
}

function normalizeTrailingCommaOverride(value) {
    if (typeof value !== "string") {
        return;
    }

    return assertTrailingCommaValue(value);
}

const CORE_OVERRIDE_NORMALIZERS = {
    trailingComma: (value) => normalizeTrailingCommaOverride(value),
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

    let changedFromDefault = false;
    const normalizedEntries = [];

    for (const key of CORE_OVERRIDE_KEYS) {
        const defaultValue = DEFAULT_CORE_OPTION_OVERRIDES[key];

        if (!hasOwn(overrides, key)) {
            normalizedEntries.push([key, defaultValue]);
            continue;
        }

        const candidate = overrides[key];

        if (candidate == null) {
            changedFromDefault = true;
            continue;
        }

        const normalizedValue = CORE_OVERRIDE_NORMALIZERS[key](candidate);

        if (normalizedValue === undefined) {
            normalizedEntries.push([key, defaultValue]);
            continue;
        }

        if (normalizedValue !== defaultValue) {
            changedFromDefault = true;
        }

        normalizedEntries.push([key, normalizedValue]);
    }

    if (
        !changedFromDefault &&
        normalizedEntries.length === CORE_OVERRIDE_KEYS.length
    ) {
        return DEFAULT_CORE_OPTION_OVERRIDES;
    }

    return Object.freeze(Object.fromEntries(normalizedEntries));
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
function resolveCoreOptionOverrides(options = {}) {
    return coreOptionOverridesResolution.resolve(options);
}

function setCoreOptionOverridesResolver(resolver) {
    return coreOptionOverridesRegistry.set(resolver);
}

function restoreDefaultCoreOptionOverridesResolver() {
    return coreOptionOverridesRegistry.restore();
}

export {
    DEFAULT_CORE_OPTION_OVERRIDES,
    resolveCoreOptionOverrides,
    restoreDefaultCoreOptionOverridesResolver,
    setCoreOptionOverridesResolver
};
