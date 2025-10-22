const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_LENGTH = 60;
const LINE_COMMENT_BANNER_LENGTH_OPTION_NAME = "lineCommentBannerLength";

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

/**
 * Return the canonical line comment options bag. The returned object is frozen
 * so callers can safely memoize the reference or reuse it across formatting
 * passes without worrying about accidental mutation in plugin hooks.
 *
 * @returns {{
 *   boilerplateFragments: readonly string[],
 *   codeDetectionPatterns: readonly RegExp[]
 * }} Shared options describing boilerplate filters and code heuristics.
 */
function resolveLineCommentOptions() {
    return DEFAULT_LINE_COMMENT_OPTIONS;
}

function createBannerLengthTypeError(received) {
    return `${LINE_COMMENT_BANNER_LENGTH_OPTION_NAME} must be a non-negative integer (received ${received}).`;
}

function formatBannerLengthTypeError(type) {
    return `${LINE_COMMENT_BANNER_LENGTH_OPTION_NAME} must be provided as a number (received type '${type}').`;
}

function coerceBannerLengthNumber(value, received) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw new TypeError(createBannerLengthTypeError(received));
    }

    if (value < 0) {
        throw new RangeError(createBannerLengthTypeError(received));
    }

    return Object.is(value, -0) ? 0 : value;
}

function normalizeLineCommentBannerLength(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return DEFAULT_LINE_COMMENT_BANNER_LENGTH;
    }

    if (typeof rawValue === "number") {
        return coerceBannerLengthNumber(rawValue, rawValue);
    }

    if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();

        if (trimmed === "") {
            return DEFAULT_LINE_COMMENT_BANNER_LENGTH;
        }

        const parsed = Number(trimmed);

        if (Number.isNaN(parsed)) {
            throw new TypeError(createBannerLengthTypeError(`'${rawValue}'`));
        }

        return coerceBannerLengthNumber(parsed, `'${trimmed}'`);
    }

    throw new TypeError(formatBannerLengthTypeError(typeof rawValue));
}

function resolveLineCommentBannerLength(options) {
    if (!options || typeof options !== "object") {
        return DEFAULT_LINE_COMMENT_BANNER_LENGTH;
    }

    if (LINE_COMMENT_BANNER_LENGTH_OPTION_NAME in options) {
        return normalizeLineCommentBannerLength(
            options[LINE_COMMENT_BANNER_LENGTH_OPTION_NAME]
        );
    }

    return DEFAULT_LINE_COMMENT_BANNER_LENGTH;
}

/**
 * Surface the regular expressions used to detect commented-out code. The
 * returned array is the shared, frozen instance so consumers should treat it as
 * read-only even though individual expressions remain mutable per JavaScript
 * semantics.
 *
 * @returns {readonly RegExp[]} Detection patterns referenced by comment
 *          formatting helpers.
 */
function getLineCommentCodeDetectionPatterns() {
    return DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
}

/**
 * Normalizes a caller-supplied options bag into the canonical structure used by
 * the formatter. Today's implementation always returns the shared default to
 * keep the dependency lightweight, but the explicit helper call makes future
 * option parsing extensions discoverable and keeps the contract consistent with
 * the other normalization utilities in this package.
 *
 * @param {unknown} [options] Placeholder for future customizations.
 * @returns {{
 *   boilerplateFragments: readonly string[],
 *   codeDetectionPatterns: readonly RegExp[]
 * }} Normalized options reference.
 */
function normalizeLineCommentOptions() {
    return DEFAULT_LINE_COMMENT_OPTIONS;
}

export {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    DEFAULT_LINE_COMMENT_BANNER_LENGTH,
    LINE_COMMENT_BANNER_LENGTH_OPTION_NAME,
    resolveLineCommentBannerLength,
    getLineCommentCodeDetectionPatterns,
    normalizeLineCommentOptions,
    resolveLineCommentOptions
};
