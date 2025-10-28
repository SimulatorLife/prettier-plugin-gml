import {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback
} from "../shared/index.js";

const DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR =
    "PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH";
const DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE = 100;
const MIN_DOC_COMMENT_WRAP_WIDTH = 1;

function normalizeWrapWidth(value, { fallback }) {
    if (value == null) {
        return fallback;
    }

    const normalized = typeof value === "string" ? value.trim() : value;

    if (normalized === "") {
        return fallback;
    }

    if (
        normalized === Infinity ||
        (typeof normalized === "string" &&
            (normalized.toLowerCase() === "infinity" ||
                normalized.toLowerCase() === "inf"))
    ) {
        return Infinity;
    }

    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    const coerced = Math.floor(numeric);
    if (coerced < MIN_DOC_COMMENT_WRAP_WIDTH) {
        return fallback;
    }

    return coerced;
}

const docCommentMaxWrapWidthConfig = createEnvConfiguredValueWithFallback({
    defaultValue: DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
    envVar: DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR,
    resolve: (value, context) => normalizeWrapWidth(value, context)
});

function getDefaultDocCommentMaxWrapWidth() {
    return docCommentMaxWrapWidthConfig.get();
}

function setDefaultDocCommentMaxWrapWidth(width) {
    return docCommentMaxWrapWidthConfig.set(width);
}

function applyDocCommentMaxWrapWidthEnvOverride(env) {
    applyConfiguredValueEnvOverride(docCommentMaxWrapWidthConfig, env);
}

applyDocCommentMaxWrapWidthEnvOverride();

const DEFAULT_DOC_COMMENT_MAX_WRAP_WIDTH = getDefaultDocCommentMaxWrapWidth();

export {
    DEFAULT_DOC_COMMENT_MAX_WRAP_WIDTH,
    DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
    DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR,
    applyDocCommentMaxWrapWidthEnvOverride,
    getDefaultDocCommentMaxWrapWidth,
    setDefaultDocCommentMaxWrapWidth
};
