import { applyEnvironmentOverride } from "../../../shared/environment-utils.js";

const PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR = "GML_PROJECT_INDEX_CONCURRENCY";
const PROJECT_INDEX_GML_CONCURRENCY_BASELINE = 4;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

let configuredDefaultProjectIndexGmlConcurrency =
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE;

function getDefaultProjectIndexGmlConcurrency() {
    return configuredDefaultProjectIndexGmlConcurrency;
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
    const candidate = parseConcurrencyCandidate(
        concurrency,
        PROJECT_INDEX_GML_CONCURRENCY_BASELINE
    );

    configuredDefaultProjectIndexGmlConcurrency =
        candidate === null
            ? PROJECT_INDEX_GML_CONCURRENCY_BASELINE
            : clampWithinLimits(candidate);

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
