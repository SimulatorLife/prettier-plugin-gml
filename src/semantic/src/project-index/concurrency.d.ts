declare const PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR =
    "GML_PROJECT_INDEX_CONCURRENCY";
declare const PROJECT_INDEX_GML_CONCURRENCY_BASELINE = 4;
declare const PROJECT_INDEX_GML_MAX_CONCURRENCY_ENV_VAR =
    "GML_PROJECT_INDEX_MAX_CONCURRENCY";
declare const PROJECT_INDEX_GML_MAX_CONCURRENCY_BASELINE = 16;
declare function getDefaultProjectIndexGmlConcurrency(): any;
declare function getDefaultProjectIndexGmlConcurrencyLimit(): any;
declare function clampConcurrency(
    value: any,
    {
        min,
        max,
        fallback
    }?: {
        min?: number;
        max?: any;
        fallback?: any;
    }
): any;
declare function setDefaultProjectIndexGmlConcurrency(concurrency: any): any;
declare function setDefaultProjectIndexGmlConcurrencyLimit(limit: any): any;
declare function applyProjectIndexConcurrencyEnvOverride(env: any): void;
declare function applyProjectIndexConcurrencyLimitEnvOverride(env: any): void;
declare const DEFAULT_PROJECT_INDEX_GML_CONCURRENCY_LIMIT: any;
declare const DEFAULT_PROJECT_INDEX_GML_CONCURRENCY: any;
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
