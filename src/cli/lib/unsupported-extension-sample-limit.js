import { coerceNonNegativeInteger } from "./shared-deps.js";
import {
    createIntegerOptionCoercer,
    createIntegerOptionState
} from "./numeric-option-state.js";

export const DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT = 5;
export const UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR =
    "PRETTIER_PLUGIN_GML_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT";

const createSampleLimitErrorMessage = (received) =>
    `Unsupported extension sample limit must be a non-negative integer (received ${received}). Provide 0 to suppress the sample list.`;

const createSampleLimitTypeErrorMessage = (type) =>
    `Unsupported extension sample limit must be provided as a number (received type '${type}').`;

const coerceUnsupportedExtensionSampleLimit = createIntegerOptionCoercer({
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage: createSampleLimitErrorMessage
});

const unsupportedExtensionSampleLimitState = createIntegerOptionState({
    defaultValue: DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT,
    envVar: UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR,
    coerce: coerceUnsupportedExtensionSampleLimit,
    typeErrorMessage: createSampleLimitTypeErrorMessage
});

const {
    getDefault: getDefaultUnsupportedExtensionSampleLimit,
    setDefault: setDefaultUnsupportedExtensionSampleLimit,
    resolve: resolveUnsupportedExtensionSampleLimitState,
    applyEnvOverride: applyUnsupportedExtensionSampleLimitEnvOverride
} = unsupportedExtensionSampleLimitState;

export {
    getDefaultUnsupportedExtensionSampleLimit,
    setDefaultUnsupportedExtensionSampleLimit,
    applyUnsupportedExtensionSampleLimitEnvOverride
};

export function resolveUnsupportedExtensionSampleLimit(
    rawValue,
    { defaultLimit } = {}
) {
    return resolveUnsupportedExtensionSampleLimitState(rawValue, {
        defaultValue: defaultLimit
    });
}

applyUnsupportedExtensionSampleLimitEnvOverride();
