import {
    coercePositiveInteger,
    resolveIntegerOption
} from "./integer-utils.js";
import { DEFAULT_PROGRESS_BAR_WIDTH } from "./progress-bar-constants.js";

const createWidthErrorMessage = (received) =>
    `Progress bar width must be a positive integer (received ${received}).`;

const createTypeErrorMessage = (type) =>
    `Progress bar width must be provided as a number (received type '${type}').`;

function coerceProgressBarWidth(value, { received }) {
    return coercePositiveInteger(value, {
        received,
        createErrorMessage: createWidthErrorMessage
    });
}

export function resolveProgressBarWidth(rawValue) {
    return resolveIntegerOption(rawValue, {
        defaultValue: DEFAULT_PROGRESS_BAR_WIDTH,
        coerce: coerceProgressBarWidth,
        typeErrorMessage: createTypeErrorMessage
    });
}

export { DEFAULT_PROGRESS_BAR_WIDTH } from "../manual/progress-bar-constants.js";
