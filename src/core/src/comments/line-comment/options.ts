import { assertFunction, isNonEmptyString, isObjectLike, isRegExpLike } from "./utils.js";

const DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS = Object.freeze([
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information",
    "@description Insert description here",
    "You can write your code in this editor"
]);

const DEFAULT_COMMENTED_OUT_CODE_PATTERNS = Object.freeze([
    /^(?:if|else|for|while|switch|do|return|break|continue|repeat|with|var|global|enum|function|try|catch|finally|throw|delete|new)\b(?!\s+(?:a|an|the)\s+\w)/i,
    /^[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\.|\(|\[|=)/,
    /^[A-Za-z_$][A-Za-z0-9_$]*\s{2,}:/,
    /^[{}()[\].]/,
    /^#/
]);

const DEFAULT_LINE_COMMENT_OPTIONS = Object.freeze({
    boilerplateFragments: DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS,
    codeDetectionPatterns: DEFAULT_COMMENTED_OUT_CODE_PATTERNS
});

let customResolver: ((options?: Record<string, unknown>) => unknown) | null = null;

function arraysMatchDefault(normalized, defaultValue) {
    return (
        Array.isArray(defaultValue) &&
        normalized.length === defaultValue.length &&
        normalized.every((entry, index) => entry === defaultValue[index])
    );
}

function normalizeArrayOption(candidate, { defaultValue, filter, map = (value) => value }) {
    if (!Array.isArray(candidate)) {
        return defaultValue;
    }

    const normalized = candidate.filter(filter).map(map);

    if (normalized.length === 0 || arraysMatchDefault(normalized, defaultValue)) {
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

    const boilerplateFragments = normalizeBoilerplateFragments(options.boilerplateFragments);
    const codeDetectionPatterns = normalizeCodeDetectionPatterns(options.codeDetectionPatterns);

    if (
        boilerplateFragments === DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments &&
        codeDetectionPatterns === DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns
    ) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    return Object.freeze({
        boilerplateFragments,
        codeDetectionPatterns
    });
}

function resolveLineCommentOptions(options = {}) {
    if (!customResolver) {
        return normalizeLineCommentOptions(options);
    }
    const result = customResolver(options);
    return normalizeLineCommentOptions(result);
}

function setLineCommentOptionsResolver(resolver) {
    assertFunction(resolver, "resolver", {
        errorMessage: "Line comment option resolvers must be functions that return option objects"
    });
    customResolver = resolver;
    return resolveLineCommentOptions();
}

function restoreDefaultLineCommentOptionsResolver() {
    customResolver = null;
    return DEFAULT_LINE_COMMENT_OPTIONS;
}

export {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    normalizeLineCommentOptions,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
};
