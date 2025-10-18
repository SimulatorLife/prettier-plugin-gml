const PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR = "GML_PROJECT_INDEX_CONCURRENCY";
const PROJECT_INDEX_GML_CONCURRENCY_BASELINE = 4;

let configuredDefaultProjectIndexGmlConcurrency =
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE;

function getDefaultProjectIndexGmlConcurrency() {
    return configuredDefaultProjectIndexGmlConcurrency;
}

function normalizeDefaultProjectIndexConcurrencyInput(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const trimmed = typeof value === "string" ? value.trim() : value;
    if (trimmed === "") {
        return null;
    }

    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
}

function clampConcurrency(
    value,
    { min = 1, max = 16, fallback = getDefaultProjectIndexGmlConcurrency() } = {}
) {
    const candidate = value ?? fallback;
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric) || numeric < min) {
        return min;
    }
    if (numeric > max) {
        return max;
    }
    return numeric;
}

function setDefaultProjectIndexGmlConcurrency(concurrency) {
    const normalized = normalizeDefaultProjectIndexConcurrencyInput(concurrency);

    if (normalized === null) {
        configuredDefaultProjectIndexGmlConcurrency =
            PROJECT_INDEX_GML_CONCURRENCY_BASELINE;
        return configuredDefaultProjectIndexGmlConcurrency;
    }

    configuredDefaultProjectIndexGmlConcurrency = clampConcurrency(normalized, {
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
