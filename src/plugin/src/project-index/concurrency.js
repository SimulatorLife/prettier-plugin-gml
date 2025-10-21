import { createEnvConfiguredValue } from "../../../shared/environment-utils.js";

const PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR = "GML_PROJECT_INDEX_CONCURRENCY";
const PROJECT_INDEX_GML_CONCURRENCY_BASELINE = 4;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

const projectIndexConcurrencyConfig = createEnvConfiguredValue({
    defaultValue: PROJECT_INDEX_GML_CONCURRENCY_BASELINE,
    envVar: PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    normalize: (value, { defaultValue }) => {
        const candidate = parseConcurrencyCandidate(value, defaultValue);

        if (candidate === null) {
            return defaultValue;
        }

        return clampWithinLimits(candidate);
    }
});

function getDefaultProjectIndexGmlConcurrency() {
    return projectIndexConcurrencyConfig.get();
}

function parseConcurrencyCandidate(value, fallback) {
    const source = value ?? fallback;
    if (source == null) {
        return null;
    }

    const normalized = typeof source === "string" ? source.trim() : source;
    if (normalized === "") {
        return null;
    }

    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
}

function clampWithinLimits(
    value,
    min = MIN_CONCURRENCY,
    max = MAX_CONCURRENCY
) {
    return Math.min(max, Math.max(min, value));
}

function clampConcurrency(
    value,
    {
        min = MIN_CONCURRENCY,
        max = MAX_CONCURRENCY,
        fallback = getDefaultProjectIndexGmlConcurrency()
    } = {}
) {
    const candidate = parseConcurrencyCandidate(value, fallback);
    if (candidate === null) {
        return min;
    }

    return clampWithinLimits(candidate, min, max);
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

export {
    DEFAULT_PROJECT_INDEX_GML_CONCURRENCY,
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE,
    PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    applyProjectIndexConcurrencyEnvOverride,
    clampConcurrency,
    getDefaultProjectIndexGmlConcurrency,
    setDefaultProjectIndexGmlConcurrency
};
