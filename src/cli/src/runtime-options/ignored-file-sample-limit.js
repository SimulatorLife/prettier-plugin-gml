import { createSampleLimitRuntimeOption } from "./sample-limit-toolkit.js";

export const {
    defaultValue: DEFAULT_IGNORED_FILE_SAMPLE_LIMIT,
    envVar: IGNORED_FILE_SAMPLE_LIMIT_ENV_VAR,
    getDefault: getDefaultIgnoredFileSampleLimit,
    setDefault: setDefaultIgnoredFileSampleLimit,
    resolve: resolveIgnoredFileSampleLimit,
    applyEnvOverride: applyIgnoredFileSampleLimitEnvOverride
} = createSampleLimitRuntimeOption({
    defaultValue: 5,
    envVar: "PRETTIER_PLUGIN_GML_IGNORED_FILE_SAMPLE_LIMIT",
    subjectLabel: "Ignored file"
});
