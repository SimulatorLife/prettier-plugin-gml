import { SingleBar, Presets } from "cli-progress";

import {
    coercePositiveInteger,
    createEnvConfiguredValue,
    getOrCreateMapEntry,
    resolveIntegerOption
} from "./shared-deps.js";

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";
const activeProgressBars = new Map();

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

const progressBarWidthConfig = createEnvConfiguredValue({
    defaultValue: DEFAULT_PROGRESS_BAR_WIDTH,
    envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
    normalize: (value, { defaultValue }) =>
        resolveProgressBarWidth(value, { defaultWidth: defaultValue })
});

function getDefaultProgressBarWidth() {
    return progressBarWidthConfig.get();
}

function setDefaultProgressBarWidth(width) {
    return progressBarWidthConfig.set(width);
}

function resolveProgressBarWidth(rawValue, { defaultWidth } = {}) {
    const fallback =
        defaultWidth === undefined
            ? getDefaultProgressBarWidth()
            : defaultWidth;

    return resolveIntegerOption(rawValue, {
        defaultValue: fallback,
        coerce: coerceProgressBarWidth,
        typeErrorMessage: createTypeErrorMessage
    });
}

function applyProgressBarWidthEnvOverride(env = process?.env) {
    progressBarWidthConfig.applyEnvOverride(env);
}

applyProgressBarWidthEnvOverride();

function createDefaultProgressBar(label, width) {
    return new SingleBar(
        {
            format: `${label} [{bar}] {value}/{total}`,
            barsize: width,
            hideCursor: true,
            clearOnComplete: true,
            linewrap: true
        },
        Presets.shades_classic
    );
}

function disposeProgressBars() {
    for (const [, bar] of activeProgressBars) {
        try {
            bar.stop();
        } catch {
            // Ignore cleanup failures so disposal continues for remaining bars.
        }
    }
    activeProgressBars.clear();
}

function renderProgressBar(label, current, total, width) {
    if (!process.stdout.isTTY || width <= 0) {
        return;
    }

    const normalizedTotal = total > 0 ? total : 1;
    const normalizedCurrent = Math.min(current, normalizedTotal);
    const hadBar = activeProgressBars.has(label);
    const bar = getOrCreateMapEntry(activeProgressBars, label, () =>
        createDefaultProgressBar(label, width)
    );

    if (hadBar) {
        bar.setTotal(normalizedTotal);
        bar.update(normalizedCurrent);
    } else {
        bar.start(normalizedTotal, normalizedCurrent);
    }

    if (current >= normalizedTotal) {
        bar.stop();
        activeProgressBars.delete(label);
    }
}

async function withProgressBarCleanup(callback) {
    if (typeof callback !== "function") {
        throw new TypeError(
            "withProgressBarCleanup requires a callback function."
        );
    }

    try {
        return await callback();
    } finally {
        disposeProgressBars();
    }
}

export {
    DEFAULT_PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_WIDTH_ENV_VAR,
    applyProgressBarWidthEnvOverride,
    disposeProgressBars,
    getDefaultProgressBarWidth,
    setDefaultProgressBarWidth,
    renderProgressBar,
    resolveProgressBarWidth,
    withProgressBarCleanup
};
