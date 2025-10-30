import {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback
} from "../shared/index.js";

const DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR =
    "PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH";
const DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE = 100;
const MIN_DOC_COMMENT_WRAP_WIDTH = 1;

/**
 * Coerce raw configuration input into a safe doc-comment wrap width.
 *
 * The helper mirrors the behavior of {@link createEnvConfiguredValueWithFallback}
 * by accepting either numeric input or loosely-typed environment values. Blank
 * strings, `null`, and `undefined` all fall back to the configured baseline so
 * callers can forward CLI flags directly without duplicating guard rails. The
 * function also recognizes common "infinity" spellings to opt out of wrapping
 * while ensuring anything below {@link MIN_DOC_COMMENT_WRAP_WIDTH} clamps to the
 * fallback value.
 *
 * @param {unknown} value Raw option value provided by the user or environment.
 * @param {{ fallback: number }} context Normalization context supplied by the
 *        env-configured value helper.
 * @returns {number} A finite wrap width or `Infinity` when explicitly
 *          requested; falls back to the configured default on invalid input.
 */
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
