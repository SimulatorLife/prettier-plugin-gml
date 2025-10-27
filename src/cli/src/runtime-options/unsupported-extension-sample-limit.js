import { createInitializedSampleLimitToolkit } from "./sample-limit-toolkit.js";

export const DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT = 5;
export const UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR =
    "PRETTIER_PLUGIN_GML_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT";

const unsupportedExtensionToolkit = createInitializedSampleLimitToolkit({
    defaultValue: DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT,
    envVar: UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR,
    subjectLabel: "Unsupported extension"
});

export const {
    getDefault: getDefaultUnsupportedExtensionSampleLimit,
    setDefault: setDefaultUnsupportedExtensionSampleLimit,
    resolve: resolveUnsupportedExtensionSampleLimit,
    applyEnvOverride: applyUnsupportedExtensionSampleLimitEnvOverride
} = unsupportedExtensionToolkit;
