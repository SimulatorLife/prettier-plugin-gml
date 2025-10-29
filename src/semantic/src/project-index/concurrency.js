import {
    applyConfiguredValueEnvOverride,
    createEnvConfiguredValueWithFallback,
    toFiniteNumber
} from "../dependencies.js";

const PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR = "GML_PROJECT_INDEX_CONCURRENCY";
const PROJECT_INDEX_GML_CONCURRENCY_BASELINE = 4;
const PROJECT_INDEX_GML_MAX_CONCURRENCY_ENV_VAR =
    "GML_PROJECT_INDEX_MAX_CONCURRENCY";
const PROJECT_INDEX_GML_MAX_CONCURRENCY_BASELINE = 16;
const MIN_CONCURRENCY = 1;

const projectIndexConcurrencyLimitConfig = createEnvConfiguredValueWithFallback(
    {
        defaultValue: PROJECT_INDEX_GML_MAX_CONCURRENCY_BASELINE,
        envVar: PROJECT_INDEX_GML_MAX_CONCURRENCY_ENV_VAR,
        resolve: (value, { fallback }) =>
            normalizeConcurrencyValue(value, {
                min: MIN_CONCURRENCY,
                max: Number.MAX_SAFE_INTEGER,
                fallback,
                onInvalid: fallback
            }),
        computeFallback: ({ defaultValue }) => defaultValue
    }
);

const projectIndexConcurrencyConfig = createEnvConfiguredValueWithFallback({
    defaultValue: PROJECT_INDEX_GML_CONCURRENCY_BASELINE,
    envVar: PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    resolve: (value, { fallback }) => {
        const limit = Math.max(
            MIN_CONCURRENCY,
            getDefaultProjectIndexGmlConcurrencyLimit()
        );
        const normalizedFallback = normalizeConcurrencyValue(fallback, {
            min: MIN_CONCURRENCY,
            max: limit,
            fallback: limit,
            onInvalid: limit
        });

        return normalizeConcurrencyValue(value, {
            min: MIN_CONCURRENCY,
            max: limit,
            fallback: normalizedFallback,
            onInvalid: normalizedFallback
        });
    },
    computeFallback: ({ defaultValue }) => defaultValue
});

function getDefaultProjectIndexGmlConcurrency() {
    return projectIndexConcurrencyConfig.get();
}

function getDefaultProjectIndexGmlConcurrencyLimit() {
    return projectIndexConcurrencyLimitConfig.get();
}

function clampConcurrency(
    value,
    {
        min = MIN_CONCURRENCY,
        max = getDefaultProjectIndexGmlConcurrencyLimit(),
        fallback = getDefaultProjectIndexGmlConcurrency()
    } = {}
) {
    const limit = Math.max(min, max);
    const normalizedFallback = normalizeConcurrencyValue(fallback, {
        min,
        max: limit,
        fallback: limit,
        onInvalid: limit
    });

    return normalizeConcurrencyValue(value, {
        min,
        max: limit,
        fallback: normalizedFallback,
        onInvalid: normalizedFallback
    });
}

function setDefaultProjectIndexGmlConcurrency(concurrency) {
    return projectIndexConcurrencyConfig.set(concurrency);
}

function setDefaultProjectIndexGmlConcurrencyLimit(limit) {
    return projectIndexConcurrencyLimitConfig.set(limit);
}

function applyProjectIndexConcurrencyEnvOverride(env) {
    applyConfiguredValueEnvOverride(projectIndexConcurrencyConfig, env);
}

function applyProjectIndexConcurrencyLimitEnvOverride(env) {
    applyConfiguredValueEnvOverride(projectIndexConcurrencyLimitConfig, env);
}

applyProjectIndexConcurrencyLimitEnvOverride();
const DEFAULT_PROJECT_INDEX_GML_CONCURRENCY_LIMIT =
    getDefaultProjectIndexGmlConcurrencyLimit();

applyProjectIndexConcurrencyEnvOverride();

const DEFAULT_PROJECT_INDEX_GML_CONCURRENCY =
    getDefaultProjectIndexGmlConcurrency();

function normalizeConcurrencyValue(
    value,
    {
        min = MIN_CONCURRENCY,
        max = getDefaultProjectIndexGmlConcurrencyLimit(),
        fallback,
        onInvalid = min
    } = {}
) {
    const source = value ?? fallback;

    if (source == null) {
        return onInvalid;
    }

    const normalized = typeof source === "string" ? source.trim() : source;

    if (normalized === "") {
        return onInvalid;
    }

    const numeric = toFiniteNumber(normalized);
    if (numeric === null) {
        return onInvalid;
    }

    return Math.min(max, Math.max(min, numeric));
}

export {
    DEFAULT_PROJECT_INDEX_GML_CONCURRENCY,
    DEFAULT_PROJECT_INDEX_GML_CONCURRENCY_LIMIT,
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE,
    PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    PROJECT_INDEX_GML_MAX_CONCURRENCY_BASELINE,
    PROJECT_INDEX_GML_MAX_CONCURRENCY_ENV_VAR,
    applyProjectIndexConcurrencyEnvOverride,
    applyProjectIndexConcurrencyLimitEnvOverride,
    clampConcurrency,
    getDefaultProjectIndexGmlConcurrency,
    getDefaultProjectIndexGmlConcurrencyLimit,
    setDefaultProjectIndexGmlConcurrency,
    setDefaultProjectIndexGmlConcurrencyLimit
};
