import { coerceNonNegativeInteger } from "./shared-deps.js";
import { createIntegerOptionToolkit } from "./integer-option-toolkit.js";

export const DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT = 5;
export const UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR =
    "PRETTIER_PLUGIN_GML_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT";

const createSampleLimitErrorMessage = (received) =>
    `Unsupported extension sample limit must be a non-negative integer (received ${received}). Provide 0 to suppress the sample list.`;

const createSampleLimitTypeErrorMessage = (type) =>
    `Unsupported extension sample limit must be provided as a number (received type '${type}').`;

const {
    getDefault: getDefaultUnsupportedExtensionSampleLimit,
    setDefault: setDefaultUnsupportedExtensionSampleLimit,
    resolve: resolveUnsupportedExtensionSampleLimit,
    applyEnvOverride: applyUnsupportedExtensionSampleLimitEnvOverride
} = createIntegerOptionToolkit({
    defaultValue: DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT,
    envVar: UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR,
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage: createSampleLimitErrorMessage,
    typeErrorMessage: createSampleLimitTypeErrorMessage,
    defaultValueOption: "defaultLimit"
});

export {
    getDefaultUnsupportedExtensionSampleLimit,
    setDefaultUnsupportedExtensionSampleLimit,
    applyUnsupportedExtensionSampleLimitEnvOverride,
    resolveUnsupportedExtensionSampleLimit
};

applyUnsupportedExtensionSampleLimitEnvOverride();
