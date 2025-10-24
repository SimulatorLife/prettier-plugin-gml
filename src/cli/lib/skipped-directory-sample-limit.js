import { coerceNonNegativeInteger } from "./shared-deps.js";
import { createIntegerOptionToolkit } from "./integer-option-toolkit.js";

export const DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT = 5;
export const SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR =
    "PRETTIER_PLUGIN_GML_SKIPPED_DIRECTORY_SAMPLE_LIMIT";

const createSampleLimitErrorMessage = (received) =>
    `Skipped directory sample limit must be a non-negative integer (received ${received}). Provide 0 to suppress the sample list.`;

const createSampleLimitTypeErrorMessage = (type) =>
    `Skipped directory sample limit must be provided as a number (received type '${type}').`;

const {
    getDefault: getDefaultSkippedDirectorySampleLimit,
    setDefault: setDefaultSkippedDirectorySampleLimit,
    resolve: resolveSkippedDirectorySampleLimit,
    applyEnvOverride: applySkippedDirectorySampleLimitEnvOverride
} = createIntegerOptionToolkit({
    defaultValue: DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT,
    envVar: SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR,
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage: createSampleLimitErrorMessage,
    typeErrorMessage: createSampleLimitTypeErrorMessage,
    defaultValueOption: "defaultLimit"
});

export {
    getDefaultSkippedDirectorySampleLimit,
    setDefaultSkippedDirectorySampleLimit,
    applySkippedDirectorySampleLimitEnvOverride,
    resolveSkippedDirectorySampleLimit
};

applySkippedDirectorySampleLimitEnvOverride();
