import { applyEnvironmentOverride } from "../../../shared/environment-utils.js";

const PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR = "GML_PROJECT_INDEX_CONCURRENCY";
const PROJECT_INDEX_GML_CONCURRENCY_BASELINE = 4;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

const DEFAULT_CONCURRENCY_LIMITS = Object.freeze({
    min: MIN_CONCURRENCY,
    max: MAX_CONCURRENCY
});

let configuredDefaultProjectIndexGmlConcurrency =
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE;

function getDefaultProjectIndexGmlConcurrency() {
    return configuredDefaultProjectIndexGmlConcurrency;
}

function toFiniteConcurrency(value) {
    if (value == null) {
        return null;
    }

    const candidate = typeof value === "string" ? value.trim() : value;
    if (candidate === "") {
        return null;
    }

    const numeric = Number(candidate);
    return Number.isFinite(numeric) ? numeric : null;
}

function clampToLimits(value, { min, max } = DEFAULT_CONCURRENCY_LIMITS) {
    return Math.min(max, Math.max(min, value));
}

function resolveConcurrencyCandidate(value, fallback) {
    return toFiniteConcurrency(value ?? fallback);
}

function clampConcurrency(
    value,
    {
        min = MIN_CONCURRENCY,
        max = MAX_CONCURRENCY,
        fallback = getDefaultProjectIndexGmlConcurrency()
    } = {}
) {
    const candidate = resolveConcurrencyCandidate(value, fallback);
    if (candidate === null) {
        return min;
    }

    return clampToLimits(candidate, { min, max });
}

function setDefaultProjectIndexGmlConcurrency(concurrency) {
    const candidate = resolveConcurrencyCandidate(
        concurrency,
        PROJECT_INDEX_GML_CONCURRENCY_BASELINE
    );

    configuredDefaultProjectIndexGmlConcurrency =
        candidate === null
            ? PROJECT_INDEX_GML_CONCURRENCY_BASELINE
            : clampToLimits(candidate);

    return configuredDefaultProjectIndexGmlConcurrency;
}

function applyProjectIndexConcurrencyEnvOverride(env = process?.env) {
    applyEnvironmentOverride({
        env,
        envVar: PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
        applyValue: setDefaultProjectIndexGmlConcurrency
    });
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
