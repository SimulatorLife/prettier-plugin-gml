const PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR = "GML_PROJECT_INDEX_CONCURRENCY";
const PROJECT_INDEX_GML_CONCURRENCY_BASELINE = 4;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

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

function clampConcurrency(
    value,
    {
        min = MIN_CONCURRENCY,
        max = MAX_CONCURRENCY,
        fallback = getDefaultProjectIndexGmlConcurrency()
    } = {}
) {
    const parsed = toFiniteConcurrency(value ?? fallback);
    if (parsed === null) {
        return min;
    }

    return Math.min(max, Math.max(min, parsed));
}

function setDefaultProjectIndexGmlConcurrency(concurrency) {
    const parsed = toFiniteConcurrency(concurrency);

    configuredDefaultProjectIndexGmlConcurrency =
        parsed === null
            ? PROJECT_INDEX_GML_CONCURRENCY_BASELINE
            : clampConcurrency(parsed, {
                  fallback: PROJECT_INDEX_GML_CONCURRENCY_BASELINE
              });

    return configuredDefaultProjectIndexGmlConcurrency;
}

function applyProjectIndexConcurrencyEnvOverride(env = process?.env) {
    const rawValue = env?.[PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR];
    if (rawValue === undefined) {
        return;
    }

    setDefaultProjectIndexGmlConcurrency(rawValue);
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
