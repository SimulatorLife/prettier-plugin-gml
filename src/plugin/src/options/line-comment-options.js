import {
    coalesceOption,
    coercePositiveIntegerOption,
    isNonEmptyString,
    isObjectLike,
    isRegExpLike
} from "../shared/index.js";
import { createResolverController } from "../shared/resolver-controller.js";

const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_LENGTH = 60;
const LINE_COMMENT_BANNER_LENGTH_OPTION = "lineCommentBannerLength";

const DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS = Object.freeze([
    // YoYo Games injects this banner while exporting assets; stripping it keeps
    // source control diffs focused on meaningful edits instead of generated noise.
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information",
    // New script files start with placeholder documentation that adds no signal to
    // version control, so we redact it automatically.
    "@description Insert description here",
    // The IDE also seeds a generic reminder about the built-in editor; keeping it
    // out of repositories avoids churn when importing starter assets.
    "You can write your code in this editor"
]);

// These heuristics flag the most common "commented out" snippets so they stay
// verbatim without requiring extra configuration from consumers.
const DEFAULT_COMMENTED_OUT_CODE_PATTERNS = Object.freeze([
    /^(?:if|else|for|while|switch|do|return|break|continue|repeat|with|var|global|enum|function)\b/i,
    /^[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\.|\(|\[|=)/,
    /^[{}()[\].]/,
    /^#/
]);

const DEFAULT_LINE_COMMENT_OPTIONS = Object.freeze({
    boilerplateFragments: DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS,
    codeDetectionPatterns: DEFAULT_COMMENTED_OUT_CODE_PATTERNS
});

const {
    resolution: lineCommentOptionsResolution,
    registry: lineCommentOptionsRegistry
} = createResolverController({
    defaultFactory: () => DEFAULT_LINE_COMMENT_OPTIONS,
    normalize: normalizeLineCommentOptions,
    errorMessage:
        "Line comment option resolvers must be functions that return option objects"
});

function arraysMatchDefault(normalized, defaultValue) {
    return (
        Array.isArray(defaultValue) &&
        normalized.length === defaultValue.length &&
        normalized.every((entry, index) => entry === defaultValue[index])
    );
}

function normalizeArrayOption(
    candidate,
    { defaultValue, filter, map = (value) => value }
) {
    if (!Array.isArray(candidate)) {
        return defaultValue;
    }

    const normalized = candidate.filter(filter).map(map);

    if (
        normalized.length === 0 ||
        arraysMatchDefault(normalized, defaultValue)
    ) {
        return defaultValue;
    }

    return Object.freeze(normalized);
}

function normalizeBoilerplateFragments(fragments) {
    return normalizeArrayOption(fragments, {
        defaultValue: DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments,
        filter: isNonEmptyString,
        map: String
    });
}

function normalizeCodeDetectionPatterns(patterns) {
    return normalizeArrayOption(patterns, {
        defaultValue: DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns,
        filter: isRegExpLike
    });
}

function normalizeLineCommentOptions(options) {
    if (options === DEFAULT_LINE_COMMENT_OPTIONS) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    if (!isObjectLike(options)) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    const boilerplateFragments = normalizeBoilerplateFragments(
        options.boilerplateFragments
    );
    const codeDetectionPatterns = normalizeCodeDetectionPatterns(
        options.codeDetectionPatterns
    );

    if (
        boilerplateFragments ===
            DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments &&
        codeDetectionPatterns ===
            DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns
    ) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    return Object.freeze({
        boilerplateFragments,
        codeDetectionPatterns
    });
}

function resolveLineCommentOptions(options = {}) {
    return lineCommentOptionsResolution.resolve(options);
}

function resolveLineCommentBannerLength(options) {
    const override = coalesceOption(options, LINE_COMMENT_BANNER_LENGTH_OPTION);

    return coercePositiveIntegerOption(
        override,
        DEFAULT_LINE_COMMENT_BANNER_LENGTH,
        { zeroReplacement: 0 }
    );
}

/**
 * Registers a custom resolver for the line comment heuristics. Intended for
 * host integrations that need to extend the boilerplate detection rules
 * without exposing additional end-user configuration.
 */
function setLineCommentOptionsResolver(resolver) {
    return lineCommentOptionsRegistry.set(resolver);
}

/**
 * Restores the built-in resolver so callers can tear down ad-hoc
 * customizations and return to the opinionated defaults.
 */
function restoreDefaultLineCommentOptionsResolver() {
    return lineCommentOptionsRegistry.restore();
}

export {
    DEFAULT_LINE_COMMENT_BANNER_LENGTH,
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    LINE_COMMENT_BANNER_LENGTH_OPTION,
    normalizeLineCommentOptions,
    resolveLineCommentBannerLength,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
};
