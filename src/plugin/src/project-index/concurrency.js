import { createEnvConfiguredValue } from "./shared-deps.js";

const PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR = "GML_PROJECT_INDEX_CONCURRENCY";
const PROJECT_INDEX_GML_CONCURRENCY_BASELINE = 4;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

const projectIndexConcurrencyConfig = createEnvConfiguredValue({
    defaultValue: PROJECT_INDEX_GML_CONCURRENCY_BASELINE,
    envVar: PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    normalize: (value, { defaultValue }) =>
        normalizeConcurrencyValue(value, {
            fallback: defaultValue,
            onInvalid: defaultValue
        })
});

function getDefaultProjectIndexGmlConcurrency() {
    return projectIndexConcurrencyConfig.get();
}

function clampConcurrency(
    value,
    {
        min = MIN_CONCURRENCY,
        max = MAX_CONCURRENCY,
        fallback = getDefaultProjectIndexGmlConcurrency()
    } = {}
) {
    return normalizeConcurrencyValue(value, { min, max, fallback });
}

function setDefaultProjectIndexGmlConcurrency(concurrency) {
    return projectIndexConcurrencyConfig.set(concurrency);
}

function applyProjectIndexConcurrencyEnvOverride(env = process?.env) {
    projectIndexConcurrencyConfig.applyEnvOverride(env);
}

applyProjectIndexConcurrencyEnvOverride();

const DEFAULT_PROJECT_INDEX_GML_CONCURRENCY =
    getDefaultProjectIndexGmlConcurrency();

function normalizeConcurrencyValue(
    value,
    {
        min = MIN_CONCURRENCY,
        max = MAX_CONCURRENCY,
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

    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) {
        return onInvalid;
    }

    return Math.min(max, Math.max(min, numeric));
}

export {
    DEFAULT_PROJECT_INDEX_GML_CONCURRENCY,
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE,
    PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    applyProjectIndexConcurrencyEnvOverride,
    clampConcurrency,
    getDefaultProjectIndexGmlConcurrency,
    setDefaultProjectIndexGmlConcurrency
};
