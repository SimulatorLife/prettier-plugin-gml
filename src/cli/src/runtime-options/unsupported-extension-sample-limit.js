import { createSampleLimitRuntimeOption } from "./sample-limit-toolkit.js";

export const {
    defaultValue: DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT,
    envVar: UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR,
    getDefault: getDefaultUnsupportedExtensionSampleLimit,
    setDefault: setDefaultUnsupportedExtensionSampleLimit,
    resolve: resolveUnsupportedExtensionSampleLimit,
    applyEnvOverride: applyUnsupportedExtensionSampleLimitEnvOverride
} = createSampleLimitRuntimeOption({
    defaultValue: 5,
    envVar: "PRETTIER_PLUGIN_GML_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT",
    subjectLabel: "Unsupported extension"
});
