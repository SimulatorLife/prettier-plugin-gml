import {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback,
    toFiniteNumber
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

    const numeric = toFiniteNumber(normalized);
    if (numeric === null) {
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

/**
 * Read the current doc-comment wrap width after applying any configured
 * overrides.
 *
 * Exposes the resolved value so printer modules can query a single source of
 * truth without reimplementing the environment/normalization pipeline. The
 * result mirrors Prettier's expectation that option accessors either return a
 * finite positive integer or `Infinity` to disable wrapping altogether.
 *
 * @returns {number} Normalized wrap width, possibly `Infinity` when wrapping is
 *          disabled.
 */
function getDefaultDocCommentMaxWrapWidth() {
    return docCommentMaxWrapWidthConfig.get();
}

/**
 * Update the baseline doc-comment wrap width used for new formatter runs.
 *
 * Callers can forward loosely-typed input (for example CLI strings or mocked
 * environment values) and rely on the shared normalization logic to clamp
 * negative numbers, coerce numeric strings, and honour the explicit
 * "infinity" opt-out. The return value reflects the stored configuration after
 * normalization so tests can assert the effective wrap behaviour.
 *
 * @param {unknown} width Candidate wrap width to persist.
 * @returns {number} Resolved wrap width stored by the configuration helper.
 */
function setDefaultDocCommentMaxWrapWidth(width) {
    return docCommentMaxWrapWidthConfig.set(width);
}

/**
 * Re-run environment override resolution for the doc-comment wrap width.
 *
 * Allows callers—primarily tests—to provide an explicit environment map and
 * verify that the configuration reacts to overrides without mutating global
 * state. When omitted, the helper falls back to {@link process.env} so runtime
 * usage continues to observe real environment variables.
 *
 * @param {NodeJS.ProcessEnv | null | undefined} [env] Optional environment map
 *        to source overrides from.
 */
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
