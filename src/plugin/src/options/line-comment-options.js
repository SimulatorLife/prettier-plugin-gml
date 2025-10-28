import { assertFunction, isRegExpLike } from "../shared/index.js";

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

function normalizeArrayOption(
    candidate,
    { defaultValue, filter, map = (value) => value }
) {
    if (!Array.isArray(candidate)) {
        return defaultValue;
    }

    const normalized = candidate.reduce((result, value) => {
        if (filter(value)) {
            result.push(map(value));
        }

        return result;
    }, []);

    if (normalized.length === 0) {
        return defaultValue;
    }

    if (
        normalized.length === defaultValue.length &&
        normalized.every((element, index) => element === defaultValue[index])
    ) {
        return defaultValue;
    }

    return Object.freeze(normalized);
}

function normalizeBoilerplateFragments(fragments) {
    return normalizeArrayOption(fragments, {
        defaultValue: DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments,
        filter: (value) => typeof value === "string" && value.length > 0,
        map: String
    });
}

function normalizeCodeDetectionPatterns(patterns) {
    return normalizeArrayOption(patterns, {
        defaultValue: DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns,
        filter: (value) => isRegExpLike(value)
    });
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
    lineCommentOptionsResolver = assertFunction(resolver, "resolver", {
        errorMessage:
            "Line comment option resolvers must be functions that return option objects"
    });
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
