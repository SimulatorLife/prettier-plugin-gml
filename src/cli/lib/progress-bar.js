import { SingleBar, Presets } from "cli-progress";

import { coercePositiveInteger } from "./shared-deps.js";
import {
    createIntegerOptionCoercer,
    createIntegerOptionState,
    createIntegerOptionResolver
} from "./numeric-option-state.js";

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";
let activeProgressBars = new Map();
let progressBarFactory = (options, preset) => new SingleBar(options, preset);

function resolveProgressStream(stdout) {
    if (!stdout) {
        return;
    }

    const stream = stdout;

    if (typeof stream.write !== "function") {
        return;
    }

    return stream;
}

const createWidthErrorMessage = (received) =>
    `Progress bar width must be a positive integer (received ${received}).`;

const createTypeErrorMessage = (type) =>
    `Progress bar width must be provided as a number (received type '${type}').`;

const coerceProgressBarWidth = createIntegerOptionCoercer({
    baseCoerce: coercePositiveInteger,
    createErrorMessage: createWidthErrorMessage
});

const progressBarWidthState = createIntegerOptionState({
    defaultValue: DEFAULT_PROGRESS_BAR_WIDTH,
    envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
    coerce: coerceProgressBarWidth,
    typeErrorMessage: createTypeErrorMessage
});

const {
    getDefault: getDefaultProgressBarWidth,
    setDefault: setDefaultProgressBarWidth,
    resolve: resolveProgressBarWidthState,
    applyEnvOverride: applyProgressBarWidthEnvOverride
} = progressBarWidthState;

const resolveProgressBarWidth = createIntegerOptionResolver(
    resolveProgressBarWidthState,
    { defaultValueOption: "defaultWidth" }
);

applyProgressBarWidthEnvOverride();

function setProgressBarFactoryForTesting(factory) {
    progressBarFactory =
        typeof factory === "function"
            ? factory
            : (options, preset) => new SingleBar(options, preset);
}

function createDefaultProgressBar(label, width, { stream } = {}) {
    return progressBarFactory(
        {
            format: `${label} [{bar}] {value}/{total}`,
            barsize: width,
            hideCursor: true,
            clearOnComplete: true,
            linewrap: true,
            ...(stream ? { stream } : {})
        },
        Presets.shades_classic,
        label
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

function resetProgressBarRegistryForTesting() {
    disposeProgressBars();
    activeProgressBars = new Map();
}

function renderProgressBar(label, current, total, width, options = {}) {
    const { stdout = process.stdout, createBar = createDefaultProgressBar } =
        options;

    if (!stdout?.isTTY || width <= 0) {
        return;
    }

    const normalizedTotal = total > 0 ? total : 1;
    const normalizedCurrent = Math.min(current, normalizedTotal);
    let bar = activeProgressBars.get(label);

    if (bar) {
        bar.setTotal(normalizedTotal);
        bar.update(normalizedCurrent);
    } else {
        const stream = resolveProgressStream(stdout);
        bar = createBar(label, width, { stream });
        activeProgressBars.set(label, bar);
        bar.start(normalizedTotal, normalizedCurrent);
    }

    if (normalizedCurrent >= normalizedTotal) {
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
    setProgressBarFactoryForTesting,
    renderProgressBar,
    resolveProgressBarWidth,
    withProgressBarCleanup,
    resetProgressBarRegistryForTesting
};
