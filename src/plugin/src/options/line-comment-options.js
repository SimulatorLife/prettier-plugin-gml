const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES = 5;
const LINE_COMMENT_BANNER_STANDARD_LENGTH = 60;

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

let lineCommentOptionsResolver = null;

function normalizeBoilerplateFragments(fragments) {
    if (!Array.isArray(fragments)) {
        return DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments;
    }

    const normalizedFragments = fragments
        .filter(
            (fragment) => typeof fragment === "string" && fragment.length > 0
        )
        .map(String);

    if (normalizedFragments.length === 0) {
        return DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments;
    }

    if (
        normalizedFragments.length ===
            DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments.length &&
        normalizedFragments.every(
            (fragment, index) =>
                fragment ===
                DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments[index]
        )
    ) {
        return DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments;
    }

    return Object.freeze([...normalizedFragments]);
}

function normalizeCodeDetectionPatterns(patterns) {
    if (!Array.isArray(patterns)) {
        return DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns;
    }

    const normalizedPatterns = patterns.filter(
        (pattern) => pattern instanceof RegExp
    );

    if (normalizedPatterns.length === 0) {
        return DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns;
    }

    if (
        normalizedPatterns.length ===
            DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns.length &&
        normalizedPatterns.every(
            (pattern, index) =>
                pattern ===
                DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns[index]
        )
    ) {
        return DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns;
    }

    return Object.freeze([...normalizedPatterns]);
}

function normalizeLineCommentOptions(options) {
    if (options === DEFAULT_LINE_COMMENT_OPTIONS) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    if (!options || typeof options !== "object") {
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
    if (!lineCommentOptionsResolver) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    return normalizeLineCommentOptions(lineCommentOptionsResolver(options));
}

/**
 * Registers a custom resolver for the line comment heuristics. Intended for
 * host integrations that need to extend the boilerplate detection rules
 * without exposing additional end-user configuration.
 */
function setLineCommentOptionsResolver(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError(
            "Line comment option resolvers must be functions that return option objects"
        );
    }

    lineCommentOptionsResolver = resolver;
    return resolveLineCommentOptions();
}

/**
 * Restores the built-in resolver so callers can tear down ad-hoc
 * customizations and return to the opinionated defaults.
 */
function restoreDefaultLineCommentOptionsResolver() {
    lineCommentOptionsResolver = null;
    return DEFAULT_LINE_COMMENT_OPTIONS;
}

export {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    LINE_COMMENT_BANNER_STANDARD_LENGTH,
    normalizeLineCommentOptions,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
};
