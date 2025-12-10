import { isObjectLike } from "../../utils/object.js";
import { createResolverController } from "../../utils/resolver-controller.js";
import { isNonEmptyString } from "../../utils/string.js";
import { isRegExpLike } from "../../utils/capability-probes.js";

// Any line comment that starts with at least this many consecutive `/`
// characters is considered a "banner" comment for formatting purposes.
// 2 slashes is the minimum to form a valid line comment in GML.
// 3 slashes is for doc-comments. Anything 4 or more is considered decorative.
const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES = 4;

const DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS = Object.freeze([
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information",
    "@description Insert description here",
    "You can write your code in this editor"
]);

const DEFAULT_COMMENTED_OUT_CODE_PATTERNS = Object.freeze([
    /^(?:if|else|for|while|switch|do|return|break|continue|repeat|with|var|global|enum|function|try|catch|finally|throw|delete|new)\b/i,
    /^[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\.|\(|\[|=)/,
    /^[{}()[\].]/,
    /^#/
]);

const DEFAULT_LINE_COMMENT_OPTIONS = Object.freeze({
    boilerplateFragments: DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS,
    codeDetectionPatterns: DEFAULT_COMMENTED_OUT_CODE_PATTERNS
});

const lineCommentOptionsController = createResolverController({
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
    return lineCommentOptionsController.resolve(options);
}

function setLineCommentOptionsResolver(resolver) {
    return lineCommentOptionsController.set(resolver);
}

function restoreDefaultLineCommentOptionsResolver() {
    return lineCommentOptionsController.restore();
}

export {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    normalizeLineCommentOptions,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
};
