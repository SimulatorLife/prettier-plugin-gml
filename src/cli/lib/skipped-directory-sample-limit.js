import { coerceNonNegativeInteger } from "./shared-deps.js";
import {
    createIntegerOptionCoercer,
    createIntegerOptionState,
    createIntegerOptionResolver
} from "./numeric-option-state.js";

export const DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT = 5;
export const SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR =
    "PRETTIER_PLUGIN_GML_SKIPPED_DIRECTORY_SAMPLE_LIMIT";

const createSampleLimitErrorMessage = (received) =>
    `Skipped directory sample limit must be a non-negative integer (received ${received}). Provide 0 to suppress the sample list.`;

const createSampleLimitTypeErrorMessage = (type) =>
    `Skipped directory sample limit must be provided as a number (received type '${type}').`;

const coerceSkippedDirectorySampleLimit = createIntegerOptionCoercer({
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage: createSampleLimitErrorMessage
});

const skippedDirectorySampleLimitState = createIntegerOptionState({
    defaultValue: DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT,
    envVar: SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR,
    coerce: coerceSkippedDirectorySampleLimit,
    typeErrorMessage: createSampleLimitTypeErrorMessage
});

const {
    getDefault: getDefaultSkippedDirectorySampleLimit,
    setDefault: setDefaultSkippedDirectorySampleLimit,
    resolve: resolveSkippedDirectorySampleLimitState,
    applyEnvOverride: applySkippedDirectorySampleLimitEnvOverride
} = skippedDirectorySampleLimitState;

export {
    getDefaultSkippedDirectorySampleLimit,
    setDefaultSkippedDirectorySampleLimit,
    applySkippedDirectorySampleLimitEnvOverride
};

export const resolveSkippedDirectorySampleLimit = createIntegerOptionResolver(
    resolveSkippedDirectorySampleLimitState,
    { defaultValueOption: "defaultLimit" }
);

applySkippedDirectorySampleLimitEnvOverride();
