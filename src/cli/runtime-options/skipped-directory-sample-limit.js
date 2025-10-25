import { createSampleLimitToolkit } from "./sample-limit-toolkit.js";

export const DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT = 5;
export const SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR =
    "PRETTIER_PLUGIN_GML_SKIPPED_DIRECTORY_SAMPLE_LIMIT";

const skippedDirectoryToolkit = createSampleLimitToolkit({
    defaultValue: DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT,
    envVar: SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR,
    subjectLabel: "Skipped directory"
});

export const {
    getDefault: getDefaultSkippedDirectorySampleLimit,
    setDefault: setDefaultSkippedDirectorySampleLimit,
    resolve: resolveSkippedDirectorySampleLimit,
    applyEnvOverride: applySkippedDirectorySampleLimitEnvOverride
} = skippedDirectoryToolkit;

applySkippedDirectorySampleLimitEnvOverride();
