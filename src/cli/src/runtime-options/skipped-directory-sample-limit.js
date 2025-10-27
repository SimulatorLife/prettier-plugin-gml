import { createSampleLimitRuntimeOption } from "./sample-limit-toolkit.js";

export const {
    defaultValue: DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT,
    envVar: SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR,
    getDefault: getDefaultSkippedDirectorySampleLimit,
    setDefault: setDefaultSkippedDirectorySampleLimit,
    resolve: resolveSkippedDirectorySampleLimit,
    applyEnvOverride: applySkippedDirectorySampleLimitEnvOverride
} = createSampleLimitRuntimeOption({
    defaultValue: 5,
    envVar: "PRETTIER_PLUGIN_GML_SKIPPED_DIRECTORY_SAMPLE_LIMIT",
    subjectLabel: "Skipped directory"
});
