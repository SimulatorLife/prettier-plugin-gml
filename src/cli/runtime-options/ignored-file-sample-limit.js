import { createSampleLimitToolkit } from "./sample-limit-toolkit.js";

export const DEFAULT_IGNORED_FILE_SAMPLE_LIMIT = 5;
export const IGNORED_FILE_SAMPLE_LIMIT_ENV_VAR =
    "PRETTIER_PLUGIN_GML_IGNORED_FILE_SAMPLE_LIMIT";

const ignoredFileToolkit = createSampleLimitToolkit({
    defaultValue: DEFAULT_IGNORED_FILE_SAMPLE_LIMIT,
    envVar: IGNORED_FILE_SAMPLE_LIMIT_ENV_VAR,
    subjectLabel: "Ignored file"
});

export const {
    getDefault: getDefaultIgnoredFileSampleLimit,
    setDefault: setDefaultIgnoredFileSampleLimit,
    resolve: resolveIgnoredFileSampleLimit,
    applyEnvOverride: applyIgnoredFileSampleLimitEnvOverride
} = ignoredFileToolkit;

applyIgnoredFileSampleLimitEnvOverride();
