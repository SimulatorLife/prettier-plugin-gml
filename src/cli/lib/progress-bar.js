import { SingleBar, Presets } from "cli-progress";

import {
    coercePositiveInteger,
    createEnvConfiguredValue,
    resolveIntegerOption
} from "./shared-deps.js";

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";
const activeProgressBars = new Map();

function resolveProgressStream(stdout) {
    if (!stdout) {
        return undefined;
    }

    const stream = stdout;

    if (typeof stream.write !== "function") {
        return undefined;
    }

    return stream;
}

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

function createDefaultProgressBar(label, width, { stream } = {}) {
    return new SingleBar(
        {
            format: `${label} [{bar}] {value}/{total}`,
            barsize: width,
            hideCursor: true,
            clearOnComplete: true,
            linewrap: true,
            ...(stream ? { stream } : {})
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

function renderProgressBar(label, current, total, width, options = {}) {
    const {
        stdout = process.stdout,
        createBar = createDefaultProgressBar
    } = options;

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
    renderProgressBar,
    resolveProgressBarWidth,
    withProgressBarCleanup
};
